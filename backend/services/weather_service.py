import time
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

from backend.database import (
    get_cached_weather,
    set_cached_weather,
    get_cached_news,
    set_cached_news,
)

WEATHER_CACHE_TTL_SEC = 300      # 5 minutes
GEOCODING_CACHE_TTL_SEC = 86400  # 24 hours
NEWS_CACHE_TTL_SEC = 900         # 15 minutes

geocoding_cache: Dict[str, Dict[str, Any]] = {}

def get_wmo_weather_info(code: int) -> Dict[str, str]:
    mapping = {
        0: ("Clear Sky", "Sun"),
        1: ("Mainly Clear", "SunDim"),
        2: ("Partly Cloudy", "CloudSun"),
        3: ("Overcast", "Cloud"),
        45: ("Foggy", "CloudFog"),
        48: ("Depositing Rime Fog", "CloudFog"),
        51: ("Light Drizzle", "CloudDrizzle"),
        53: ("Moderate Drizzle", "CloudDrizzle"),
        55: ("Dense Drizzle", "CloudDrizzle"),
        56: ("Freezing Drizzle", "CloudSnow"),
        57: ("Dense Freezing Drizzle", "CloudSnow"),
        61: ("Slight Rain", "CloudRain"),
        63: ("Moderate Rain", "CloudRain"),
        65: ("Heavy Rain", "CloudRain"),
        66: ("Freezing Rain", "CloudSnow"),
        67: ("Heavy Freezing Rain", "CloudSnow"),
        71: ("Slight Snowfall", "CloudSnow"),
        73: ("Moderate Snowfall", "CloudSnow"),
        75: ("Heavy Snowfall", "CloudSnow"),
        77: ("Snow Grains", "CloudSnow"),
        80: ("Rain Showers", "CloudRain"),
        81: ("Moderate Showers", "CloudRain"),
        82: ("Violent Showers", "CloudRain"),
        85: ("Snow Showers", "CloudSnow"),
        86: ("Heavy Snow Showers", "CloudSnow"),
        95: ("Thunderstorm", "CloudLightning"),
        96: ("Thunderstorm with Slight Hail", "CloudLightning"),
        99: ("Thunderstorm with Heavy Hail", "CloudLightning"),
    }
    cond, icon = mapping.get(code, ("Variable Conditions", "CloudSun"))
    return {"condition": cond, "icon": icon}

def get_wind_cardinal(deg: float) -> str:
    if deg is None:
        return "VAR"
    dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    idx = int(((deg + 11.25) % 360) / 22.5) % 16
    return dirs[idx]

def clean_html_text(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r'<[^>]*>', ' ', raw)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' ')
    return re.sub(r'\s+', ' ', text).strip()

def categorize_news_headline(title: str, snippet: str = "") -> str:
    t = f"{title} {snippet}".lower()
    if re.search(r'\b(cyclone|hurricane|typhoon|super typhoon|storm surge|landfall)\b', t):
        return "CYCLONES_HURRICANES"
    if re.search(r'\b(flood|inundat|overflow|waterlogged|deluge|flash flood|submerged|chembarambakkam|poondi|cooum|adyar)\b', t):
        return "EXTREME_RAIN_FLOOD"
    if re.search(r'\b(heatwave|drought|wildfire|record high|extreme heat|scorching)\b', t):
        return "HEATWAVE_DROUGHT"
    if re.search(r'\b(monsoon|downpour|heavy rain|cloudburst|precipitation)\b', t):
        return "MONSOON_UPDATES"
    if re.search(r'\b(warning|alert|red alert|orange alert|evacuat|bulletin|advisory|ndrf|sdrf|tnsdma)\b', t):
        return "DISASTER_ALERTS"
    return "METEOROLOGY_GENERAL"

def detect_region(text: str) -> str:
    t = text.lower()
    if re.search(r'\b(india|chennai|tamil nadu|bengaluru|mumbai|delhi|kerala|assam|odisha|kolkata|cooum|ambattur|avadi)\b', t):
        return "INDIA"
    if re.search(r'\b(japan|tokyo|china|beijing|korea|taiwan|philippines|vietnam|indonesia|thailand|malaysia|asia)\b', t):
        return "ASIA_PACIFIC"
    if re.search(r'\b(uk|london|britain|germany|france|italy|spain|greece|europe|european)\b', t):
        return "EUROPE"
    if re.search(r'\b(usa|us|america|florida|california|texas|new york|canada|caribbean)\b', t):
        return "NORTH_AMERICA"
    if re.search(r'\b(brazil|chile|argentina|peru|colombia|south america)\b', t):
        return "SOUTH_AMERICA"
    if re.search(r'\b(egypt|morocco|kenya|south africa|nigeria|saudi|uae|dubai|middle east|sahara|somalia|africa)\b', t):
        return "AFRICA_MIDDLE_EAST"
    return "GLOBAL"


# ==============================================================================
# WEATHER DATA ACCESS (Open-Meteo with SQLite Caching)
# ==============================================================================

async def fetch_open_meteo_weather(
    lat: float,
    lon: float,
    city: str = "Unknown",
    region: str = "",
    country: str = "Unknown"
) -> Dict[str, Any]:
    """
    Fetches real-time atmospheric observations and 7-day forecast from Open-Meteo.
    Caches successful results into SQLite weather_cache table with 5-minute TTL.
    On network or API failure, returns last valid cached entry from SQLite.
    """
    cache_key = f"{lat:.3f},{lon:.3f}"
    
    # 1. Check SQLite Cache
    cached = get_cached_weather(cache_key)
    if cached and not cached.get("isExpired"):
        return {**cached, "isCached": True}

    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m"
        "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max"
        "&timezone=auto&forecast_days=7"
    )

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "FloodGuard/2.1 (Free Hydrological Open Source)"})
            if resp.status_code == 200:
                raw = resp.json()
                parsed = _parse_open_meteo_response(raw, lat, lon, city, region, country)
                
                # Persist to SQLite
                set_cached_weather(cache_key, parsed, ttl_sec=WEATHER_CACHE_TTL_SEC)
                return {**parsed, "isCached": False}
    except Exception as e:
        print(f"Notice: Open-Meteo fetch error for ({lat}, {lon}):", e)

    # 2. Resilient fallback to expired SQLite cache if external call fails
    if cached:
        return {**cached, "isCached": True, "cachedFallback": True}

    return {
        "success": False,
        "error": "Weather data is temporarily unavailable. Check your connection or retry.",
        "location": {"lat": lat, "lon": lon, "city": city, "region": region, "country": country},
        "lastUpdated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _parse_open_meteo_response(
    raw: Dict[str, Any],
    lat: float,
    lon: float,
    city: str,
    region: str,
    country: str
) -> Dict[str, Any]:
    curr = raw.get("current", {})
    code = curr.get("weather_code", 0)
    w_info = get_wmo_weather_info(code)
    wind_dir = curr.get("wind_direction_10m", 0)

    # 24-hour hourly
    hourly_times = raw.get("hourly", {}).get("time", [])
    current_iso = curr.get("time", "")
    start_idx = 0
    for idx, t in enumerate(hourly_times):
        if t >= current_iso:
            start_idx = idx
            break

    hourly_list = []
    h_data = raw.get("hourly", {})
    for i in range(start_idx, min(start_idx + 24, len(hourly_times))):
        h_code = h_data.get("weather_code", [])[i] if i < len(h_data.get("weather_code", [])) else 0
        h_info = get_wmo_weather_info(h_code)
        raw_t = hourly_times[i]
        hourly_list.append({
            "time": raw_t,
            "hourLabel": raw_t[11:16] if len(raw_t) >= 16 else raw_t,
            "temperature": round(h_data.get("temperature_2m", [])[i], 1) if i < len(h_data.get("temperature_2m", [])) else 0.0,
            "humidity": round(h_data.get("relative_humidity_2m", [])[i]) if i < len(h_data.get("relative_humidity_2m", [])) else 0,
            "precipitationProbability": round(h_data.get("precipitation_probability", [])[i]) if i < len(h_data.get("precipitation_probability", [])) else 0,
            "precipitation": round(h_data.get("precipitation", [])[i], 1) if i < len(h_data.get("precipitation", [])) else 0.0,
            "weatherCode": h_code,
            "weatherCondition": h_info["condition"],
            "iconName": h_info["icon"],
            "windSpeed": round(h_data.get("wind_speed_10m", [])[i], 1) if i < len(h_data.get("wind_speed_10m", [])) else 0.0,
        })

    # 7-day daily
    d_data = raw.get("daily", {})
    daily_times = d_data.get("time", [])
    daily_list = []
    for i in range(len(daily_times)):
        d_code = d_data.get("weather_code", [])[i] if i < len(d_data.get("weather_code", [])) else 0
        d_info = get_wmo_weather_info(d_code)
        d_date = daily_times[i]
        try:
            dt = datetime.strptime(d_date, "%Y-%m-%d")
            label = "Today" if i == 0 else dt.strftime("%a, %b %d")
        except Exception:
            label = d_date

        daily_list.append({
            "date": d_date,
            "dayLabel": label,
            "weatherCode": d_code,
            "weatherCondition": d_info["condition"],
            "iconName": d_info["icon"],
            "tempMax": round(d_data.get("temperature_2m_max", [])[i], 1) if i < len(d_data.get("temperature_2m_max", [])) else 0.0,
            "tempMin": round(d_data.get("temperature_2m_min", [])[i], 1) if i < len(d_data.get("temperature_2m_min", [])) else 0.0,
            "precipitationSum": round(d_data.get("precipitation_sum", [])[i], 1) if i < len(d_data.get("precipitation_sum", [])) else 0.0,
            "precipitationProbabilityMax": round(d_data.get("precipitation_probability_max", [])[i]) if i < len(d_data.get("precipitation_probability_max", [])) else 0,
            "windSpeedMax": round(d_data.get("wind_speed_10m_max", [])[i], 1) if i < len(d_data.get("wind_speed_10m_max", [])) else 0.0,
        })

    return {
        "success": True,
        "provider": "Open-Meteo Free Weather API",
        "providerUrl": "https://open-meteo.com/",
        "isModelForecast": True,
        "lastUpdated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "location": {
            "lat": lat,
            "lon": lon,
            "city": city,
            "region": region,
            "country": country,
        },
        "current": {
            "temperature": round(curr.get("temperature_2m", 0.0), 1),
            "apparentTemperature": round(curr.get("apparent_temperature", curr.get("temperature_2m", 0.0)), 1),
            "humidity": round(curr.get("relative_humidity_2m", 0)),
            "weatherCode": code,
            "weatherCondition": w_info["condition"],
            "iconName": w_info["icon"],
            "precipitation": round(curr.get("precipitation", 0.0), 1),
            "rain": round(curr.get("rain", 0.0), 1),
            "windSpeed": round(curr.get("wind_speed_10m", 0.0), 1),
            "windDirection": wind_dir,
            "windDirectionCardinal": get_wind_cardinal(wind_dir),
            "isDay": bool(curr.get("is_day", 1)),
            "timestamp": curr.get("time", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        },
        "hourly": hourly_list,
        "daily": daily_list,
    }


async def search_cities(query: str) -> List[Dict[str, Any]]:
    cache_key = query.lower().strip()
    now = time.time()
    if cache_key in geocoding_cache:
        cached = geocoding_cache[cache_key]
        if now - cached["timestamp"] < GEOCODING_CACHE_TTL_SEC:
            return cached["results"]

    url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(query)}&count=10&language=en&format=json"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={"User-Agent": "FloodGuard/2.1"})
            if resp.status_code != 200:
                return []
            data = resp.json()
            raw_results = data.get("results", [])
            formatted = []
            for r in raw_results:
                formatted.append({
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "latitude": r.get("latitude"),
                    "longitude": r.get("longitude"),
                    "country": r.get("country", ""),
                    "countryCode": r.get("country_code", ""),
                    "admin1": r.get("admin1") or r.get("admin2") or "",
                    "timezone": r.get("timezone", ""),
                })
            geocoding_cache[cache_key] = {"results": formatted, "timestamp": now}
            return formatted
    except Exception:
        return []


# ==============================================================================
# NEWS RSS FEED ACCESS (Genuine Public Feeds with SQLite Caching)
# ==============================================================================

NEWS_FEEDS_CONFIG = {
    "chennai": {
        "title": "Chennai Flood & Waterlogging Updates",
        "url": "https://news.google.com/rss/search?q=chennai+floods+when:7d&hl=en-IN&gl=IN&ceid=IN:en",
        "category": "EXTREME_RAIN_FLOOD",
        "location": "Chennai / Avadi Basin",
    },
    "tamilnadu": {
        "title": "Tamil Nadu Rainfall & Weather Alerts",
        "url": "https://news.google.com/rss/search?q=tamil+nadu+rainfall+weather+when:7d&hl=en-IN&gl=IN&ceid=IN:en",
        "category": "MONSOON_UPDATES",
        "location": "Tamil Nadu",
    },
    "flood_alerts": {
        "title": "India Flood Warnings & Reservoir Bulletins",
        "url": "https://news.google.com/rss/search?q=india+flood+alerts+when:7d&hl=en-IN&gl=IN&ceid=IN:en",
        "category": "DISASTER_ALERTS",
        "location": "India National",
    },
    "disaster_mgmt": {
        "title": "Disaster Management & Preparedness",
        "url": "https://news.google.com/rss/search?q=india+disaster+management+flood+relief+when:7d&hl=en-IN&gl=IN&ceid=IN:en",
        "category": "DISASTER_ALERTS",
        "location": "National / State",
    },
}

async def fetch_rss_feed_articles(feed_key: str, feed_meta: Dict[str, str], client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    articles = []
    try:
        resp = await client.get(feed_meta["url"], headers={"User-Agent": "FloodGuard/2.1 (Open-Source RSS Reader)"})
        if resp.status_code == 200:
            root = ET.fromstring(resp.content)
            items = root.findall("./channel/item")
            for idx, item in enumerate(items):
                title = item.findtext("title") or ""
                link = item.findtext("link") or ""
                pub_date = item.findtext("pubDate") or ""
                source_elem = item.find("source")
                publisher = source_elem.text if source_elem is not None and source_elem.text else "Regional News"
                desc = item.findtext("description") or ""

                headline = clean_html_text(title)
                snippet = clean_html_text(desc)[:240]

                if not headline or not link or not link.startswith("http"):
                    continue

                articles.append({
                    "id": f"RSS-{feed_key}-{idx}-{abs(hash(headline)) % 1000000}",
                    "headline": headline,
                    "publisher": publisher,
                    "publishedAt": pub_date or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "publishedDate": pub_date[:16] if pub_date else "Recent",
                    "sourceUrl": link,
                    "snippet": snippet,
                    "category": categorize_news_headline(headline, snippet),
                    "region": detect_region(headline + " " + feed_meta["location"]),
                    "locationOrRegion": feed_meta["location"],
                    "feedKey": feed_key,
                })
    except Exception as e:
        print(f"Notice: Failed to fetch RSS feed '{feed_key}':", e)
    return articles


async def get_floodguard_news(category: str = "all", limit: int = 50) -> Dict[str, Any]:
    """
    Standardized news endpoint for FloodGuard 2.1.
    Retrieves genuine public RSS feeds, validates URLs, deduplicates, and caches in SQLite.
    """
    cat_norm = category.lower().strip()
    cache_key = f"news_{cat_norm}"

    # 1. Check SQLite Cache
    cached = get_cached_news(cache_key)
    if cached and not cached.get("isExpired"):
        articles = cached.get("articles", [])
        return {
            "success": True,
            "category": cat_norm,
            "total": len(articles[:limit]),
            "lastUpdated": cached.get("cachedAt", ""),
            "isCached": True,
            "articles": articles[:limit],
        }

    # 2. Fetch from active RSS feeds
    targets = {}
    if cat_norm in NEWS_FEEDS_CONFIG:
        targets[cat_norm] = NEWS_FEEDS_CONFIG[cat_norm]
    else:
        # 'all' or combined query
        targets = NEWS_FEEDS_CONFIG

    all_articles = []
    seen_norm = set()

    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        for f_key, f_meta in targets.items():
            feed_items = await fetch_rss_feed_articles(f_key, f_meta, client)
            for art in feed_items:
                norm_title = re.sub(r'[^a-z0-9]', '', art["headline"].lower())
                if norm_title not in seen_norm:
                    seen_norm.add(norm_title)
                    all_articles.append(art)

    if all_articles:
        # Cache to SQLite
        set_cached_news(cache_key, all_articles, ttl_sec=NEWS_CACHE_TTL_SEC)
        return {
            "success": True,
            "category": cat_norm,
            "total": len(all_articles[:limit]),
            "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "isCached": False,
            "articles": all_articles[:limit],
        }

    # 3. Fallback to expired cache if external RSS is temporarily unreachable
    if cached and cached.get("articles"):
        return {
            "success": True,
            "category": cat_norm,
            "total": len(cached["articles"][:limit]),
            "lastUpdated": cached.get("cachedAt", ""),
            "isCached": True,
            "cachedFallback": True,
            "articles": cached["articles"][:limit],
        }

    return {
        "success": False,
        "category": cat_norm,
        "total": 0,
        "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "isCached": False,
        "error": "Currently, no news articles are available. Please try again later.",
        "articles": [],
    }


# Backwards compatibility wrappers
async def get_weather_forecast(lat: float, lon: float, city: str = "Unknown", region: str = "", country: str = "Unknown") -> Dict[str, Any]:
    return await fetch_open_meteo_weather(lat=lat, lon=lon, city=city, region=region, country=country)

async def get_local_weather_news(query: str = "Chennai", region: str = "", country: str = "", country_code: str = "", timezone: str = "") -> Dict[str, Any]:
    q_low = query.lower()
    if "chennai" in q_low or "avadi" in q_low or "ambattur" in q_low:
        cat = "chennai"
    elif "tamil nadu" in q_low:
        cat = "tamilnadu"
    else:
        cat = "all"
    return await get_floodguard_news(category=cat, limit=40)

async def get_global_weather_news() -> Dict[str, Any]:
    return await get_floodguard_news(category="flood_alerts", limit=50)
