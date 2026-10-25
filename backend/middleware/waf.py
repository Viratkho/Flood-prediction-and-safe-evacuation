import re
import time
import urllib.parse
from typing import Dict, Any, List, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

class WAFState:
    total_requests_inspected: int = 0
    total_threats_blocked: int = 0
    quarantined_ips: Dict[str, float] = {}  # ip -> unban_timestamp
    rate_limit_map: Dict[str, Dict[str, Any]] = {}  # ip -> {count, reset_time}
    ip_violation_count: Dict[str, int] = {}
    threat_stats: Dict[str, int] = {
        "sqlInjection": 0,
        "xss": 0,
        "pathTraversal": 0,
        "rateLimitExceeded": 0,
        "maliciousBots": 0,
        "suspiciousPayloads": 0,
    }
    threat_logs: List[Dict[str, Any]] = [
        {
            "id": "WAF-SEC-101",
            "timestamp": "10:12:15 AM",
            "threatType": "SQL_INJECTION",
            "severity": "CRITICAL",
            "clientIp": "198.51.100.44",
            "endpoint": "/api/dam",
            "method": "GET",
            "details": "Signature match: UNION SELECT * FROM dams detected in query parameter",
            "action": "BLOCKED_403",
        },
        {
            "id": "WAF-SEC-102",
            "timestamp": "10:08:42 AM",
            "threatType": "XSS_ATTACK",
            "severity": "HIGH",
            "clientIp": "203.0.113.89",
            "endpoint": "/api/people",
            "method": "POST",
            "details": "Malicious payload <script>alert(1)</script> intercepted in fullName input",
            "action": "BLOCKED_403",
        },
        {
            "id": "WAF-SEC-103",
            "timestamp": "09:55:10 AM",
            "threatType": "PATH_TRAVERSAL",
            "severity": "HIGH",
            "clientIp": "192.0.2.112",
            "endpoint": "/api/static/../../etc/passwd",
            "method": "GET",
            "details": "Directory traversal sequence (../) attempting to access sensitive system files",
            "action": "BLOCKED_403",
        },
    ]

    @classmethod
    def record_violation(cls, ip: str):
        count = cls.ip_violation_count.get(ip, 0) + 1
        cls.ip_violation_count[ip] = count
        if count >= 5:
            cls.quarantined_ips[ip] = time.time() + 15 * 60

    @classmethod
    def clear_quarantine(cls) -> int:
        released = len(cls.quarantined_ips)
        cls.quarantined_ips.clear()
        cls.ip_violation_count.clear()
        cls.rate_limit_map.clear()
        return released

waf_state = WAFState()

SQLI_REGEX = re.compile(
    r"(\b(union(\s+all)?\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|update\s+.*\s+set|exec(\s|\+)+(s|x)p\w+|benchmark\s*\(|sleep\s*\(|pg_sleep\s*\()\b|(['\"])\s*(or|and)\s*['\"]?\d+['\"]?\s*=\s*['\"]?\d+|--|/\*|\*/|;\s*drop\b)",
    re.IGNORECASE,
)

XSS_REGEX = re.compile(
    r"(<script\b[^>]*>([\s\S]*?)<\/script>|javascript\s*:|onerror\s*=|onload\s*=|onclick\s*=|eval\s*\(|<iframe\b|<svg\b[^>]*onload)",
    re.IGNORECASE,
)

TRAVERSAL_REGEX = re.compile(
    r"(\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|/etc/passwd|/etc/shadow|win\.ini|boot\.ini)",
    re.IGNORECASE,
)

BOT_REGEX = re.compile(
    r"sqlmap|nikto|masscan|acunetix|wpscan|nmap|gobuster|dirbuster|havij",
    re.IGNORECASE,
)

class WAFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Bypass static assets and internal vite tooling
        if (
            path.startswith("/@")
            or path.startswith("/src")
            or path.startswith("/node_modules")
            or path.startswith("/public")
            or re.search(r"\.(js|css|ts|tsx|svg|png|jpg|jpeg|ico|json|map|woff2?)$", path, re.I)
        ):
            response = await call_next(request)
            self._add_security_headers(response)
            return response

        waf_state.total_requests_inspected += 1

        # Client IP extraction
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "127.0.0.1")

        is_clearance_endpoint = path == "/api/security/firewall-clear-quarantine"

        # 1. IP Quarantine Check
        now = time.time()
        unban_time = waf_state.quarantined_ips.get(client_ip)
        if not is_clearance_endpoint and unban_time and now < unban_time:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Access Denied: Your IP address is quarantined due to repeated security policy violations.",
                    "firewallCode": "WAF_IP_QUARANTINED",
                    "quarantineExpiresInSeconds": int(unban_time - now),
                },
            )
        elif unban_time and now >= unban_time:
            waf_state.quarantined_ips.pop(client_ip, None)

        # 2. Sliding Window Rate Limiting
        rate_record = waf_state.rate_limit_map.get(client_ip) or {"count": 0, "reset_time": now + 60}
        if now > rate_record["reset_time"]:
            rate_record["count"] = 1
            rate_record["reset_time"] = now + 60
        else:
            rate_record["count"] += 1
        waf_state.rate_limit_map[client_ip] = rate_record

        max_limit = 60 if ("/api/ai" in path or "/api/alerts/send-mobile" in path) else 240
        if not is_clearance_endpoint and rate_record["count"] > max_limit:
            waf_state.total_threats_blocked += 1
            waf_state.threat_stats["rateLimitExceeded"] += 1
            log_id = f"WAF-RATE-{hex(int(time.time()*1000))[2:].upper()}"
            waf_state.threat_logs.insert(0, {
                "id": log_id,
                "timestamp": time.strftime("%I:%M:%S %p"),
                "threatType": "RATE_LIMIT_EXCEEDED",
                "severity": "MEDIUM",
                "clientIp": client_ip,
                "endpoint": path,
                "method": request.method,
                "details": f"Request rate ({rate_record['count']}/min) exceeded firewall threshold ({max_limit}/min)",
                "action": "RATE_LIMITED_429",
            })
            if len(waf_state.threat_logs) > 50:
                waf_state.threat_logs.pop()

            resp = JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded: Too many requests intercepted by Web Application Firewall.",
                    "firewallCode": "WAF_RATE_LIMIT_429",
                    "limit": max_limit,
                    "retryAfterSeconds": 60,
                },
            )
            resp.headers["Retry-After"] = "60"
            self._add_security_headers(resp)
            return resp

        # 3. Scanner Bot User-Agent Detection
        user_agent = request.headers.get("user-agent", "")
        if BOT_REGEX.search(user_agent):
            waf_state.total_threats_blocked += 1
            waf_state.threat_stats["maliciousBots"] += 1
            waf_state.record_violation(client_ip)
            log_id = f"WAF-BOT-{hex(int(time.time()*1000))[2:].upper()}"
            waf_state.threat_logs.insert(0, {
                "id": log_id,
                "timestamp": time.strftime("%I:%M:%S %p"),
                "threatType": "MALICIOUS_BOT",
                "severity": "HIGH",
                "clientIp": client_ip,
                "endpoint": path,
                "method": request.method,
                "details": f"Automated vulnerability scanner signature detected: {user_agent[:50]}",
                "action": "BLOCKED_403",
            })
            if len(waf_state.threat_logs) > 50:
                waf_state.threat_logs.pop()

            resp = JSONResponse(
                status_code=403,
                content={
                    "error": "Security Warning: Malicious automated scanner or bot detected by WAF.",
                    "firewallCode": "WAF_BOT_BLOCKED_403",
                },
            )
            self._add_security_headers(resp)
            return resp

        # 4. Deep Packet Inspection on URL, Query, and Body
        raw_query = str(request.url.query)
        # Read body safely without consuming it permanently for downstream handlers
        body_bytes = await request.body()
        raw_body = body_bytes.decode("utf-8", errors="replace") if body_bytes else ""

        full_target = f"{path} {raw_query} {raw_body}"
        try:
            full_target_decoded = urllib.parse.unquote(full_target)
        except Exception:
            full_target_decoded = full_target
        inspection_target = f"{full_target} {full_target_decoded}"

        # SQLi
        if SQLI_REGEX.search(inspection_target):
            waf_state.total_threats_blocked += 1
            waf_state.threat_stats["sqlInjection"] += 1
            waf_state.record_violation(client_ip)
            log_id = f"WAF-SQLI-{hex(int(time.time()*1000))[2:].upper()}"
            waf_state.threat_logs.insert(0, {
                "id": log_id,
                "timestamp": time.strftime("%I:%M:%S %p"),
                "threatType": "SQL_INJECTION",
                "severity": "CRITICAL",
                "clientIp": client_ip,
                "endpoint": path,
                "method": request.method,
                "details": "OWASP Top 10 SQL Injection pattern intercepted in request payload",
                "action": "BLOCKED_403",
            })
            if len(waf_state.threat_logs) > 50:
                waf_state.threat_logs.pop()

            resp = JSONResponse(
                status_code=403,
                content={
                    "error": "Web Application Firewall Blocked: SQL Injection Signature Detected",
                    "firewallCode": "WAF_SQLI_BLOCKED_403",
                    "action": "Packet Dropped",
                },
            )
            self._add_security_headers(resp)
            return resp

        # XSS
        if XSS_REGEX.search(inspection_target):
            waf_state.total_threats_blocked += 1
            waf_state.threat_stats["xss"] += 1
            waf_state.record_violation(client_ip)
            log_id = f"WAF-XSS-{hex(int(time.time()*1000))[2:].upper()}"
            waf_state.threat_logs.insert(0, {
                "id": log_id,
                "timestamp": time.strftime("%I:%M:%S %p"),
                "threatType": "XSS_ATTACK",
                "severity": "HIGH",
                "clientIp": client_ip,
                "endpoint": path,
                "method": request.method,
                "details": "OWASP Top 10 Cross-Site Scripting (XSS) vector intercepted in request payload",
                "action": "BLOCKED_403",
            })
            if len(waf_state.threat_logs) > 50:
                waf_state.threat_logs.pop()

            resp = JSONResponse(
                status_code=403,
                content={
                    "error": "Web Application Firewall Blocked: Malicious Script (XSS) Detected",
                    "firewallCode": "WAF_XSS_BLOCKED_403",
                    "action": "Packet Dropped",
                },
            )
            self._add_security_headers(resp)
            return resp

        # Path Traversal
        if TRAVERSAL_REGEX.search(inspection_target):
            waf_state.total_threats_blocked += 1
            waf_state.threat_stats["pathTraversal"] += 1
            waf_state.record_violation(client_ip)
            log_id = f"WAF-TRAV-{hex(int(time.time()*1000))[2:].upper()}"
            waf_state.threat_logs.insert(0, {
                "id": log_id,
                "timestamp": time.strftime("%I:%M:%S %p"),
                "threatType": "PATH_TRAVERSAL",
                "severity": "HIGH",
                "clientIp": client_ip,
                "endpoint": path,
                "method": request.method,
                "details": "Directory traversal sequence attempting to access sensitive system files",
                "action": "BLOCKED_403",
            })
            if len(waf_state.threat_logs) > 50:
                waf_state.threat_logs.pop()

            resp = JSONResponse(
                status_code=403,
                content={
                    "error": "Web Application Firewall Blocked: Directory Traversal Attempt Detected",
                    "firewallCode": "WAF_PATH_TRAVERSAL_BLOCKED_403",
                    "action": "Packet Dropped",
                },
            )
            self._add_security_headers(resp)
            return resp

        # Forward request
        response = await call_next(request)
        self._add_security_headers(response)
        return response

    def _add_security_headers(self, response: Response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), payment=(), usb=()"
        response.headers["X-Firewall-Protection"] = "Aegis-WAF-v2.1; status=active"
        response.headers["X-Zero-Fingerprint"] = "Enforced"
