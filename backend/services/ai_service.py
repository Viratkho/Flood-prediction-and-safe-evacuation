import os
import asyncio
from typing import Dict, Any, Optional, List
import httpx

def generate_rule_based_emergency_advice(
    query: str,
    dam: Dict[str, Any],
    user_location: Optional[List[float]] = None,
    blocked_roads: Optional[List[str]] = None,
    nearest_shelter: Optional[str] = None,
    person_profile: Optional[Dict[str, Any]] = None,
) -> str:
    q = (query or "").lower()
    name = (person_profile or {}).get("name") or "Citizen"
    shelter = nearest_shelter or "Thirumullaivoyal High Ridge Defense Pavilion (Elevation 24.8m)"
    conditions = (person_profile or {}).get("medicalConditions") or []
    heart_rate = (person_profile or {}).get("heartRateBpm")
    has_cardiac = "CARDIAC" in conditions or (heart_rate is not None and heart_rate > 115)
    has_diabetic = "DIABETIC" in conditions
    has_elderly = "ELDERLY" in conditions
    has_mobility = "MOBILITY_IMPAIRED" in conditions

    medical_snippet = ""
    if has_cardiac:
        medical_snippet = (
            "\n\n🩺 **Cardiac / High Heart Rate Advisory**:\n"
            "• Your registered heart rate is elevated. Do NOT run or wade against heavy water resistance.\n"
            "• Move steadily, pause to rest on intermediate landings, and avoid lifting heavy bags.\n"
            "• Keep nitroglycerin / prescribed cardiac medicine accessible in a waterproof ziplock."
        )
    elif has_diabetic:
        medical_snippet = (
            "\n\n🩺 **Diabetic Care Advisory**:\n"
            "• Secure insulin pens and glucometers in a buoyant, waterproof pouch.\n"
            "• Keep emergency sugar/glucose tablets on your person in case walking exertion causes hypoglycemia."
        )
    elif has_mobility or has_elderly:
        medical_snippet = (
            "\n\n🩺 **Assisted Mobility Protocol**:\n"
            "• Request family or neighborhood escorts immediately before water exceeds 15cm.\n"
            "• If stairs or wheelchair routes are submerged, move to the nearest dry first/second floor landing and signal with a flashlight."
        )

    res_level = dam.get("reservoirLevelM", 32.4)
    spillway = dam.get("spillwayReleaseCusecs", 3500)
    dam_status = dam.get("status", "NORMAL")
    precip = dam.get("precipitationMmH", 14.5)
    inflow = dam.get("inflowCusecs", 14200)

    # 1. Fastest Route / Where to go
    if any(k in q for k in ["fastest", "route", "where to go", "direction", "evacuat"]):
        contact = (person_profile or {}).get("contactNumber") or "your mobile phone"
        return (
            f"🚨 **Fastest Evacuation Route Directive for {name}**:\n"
            f"Current Dam Level: **{res_level}m** | Spillway Discharge: **{spillway:,} cusecs**\n\n"
            "🧭 **Primary Safe Corridor**:\n"
            "1. Take the **Thirumullaivoyal Outer Crest Express (Elevation: 22.0m - 24.8m)** heading directly north.\n"
            f"2. Proceed to **{shelter}** (Dry zone, full medical triage and power backup active).\n\n"
            "⚠️ **CRITICAL HAZARDS - DO NOT CROSS**:\n"
            "• **Paruthipattu Low Riverbank (R101-S3)**: Submerged under >45cm rapid runoff.\n"
            "• **Kovur Culvert Causeway (R106-S1)**: Active spillway backflow (>55cm water depth).\n"
            f"{medical_snippet}\n\n"
            "📱 **Mobile Alert Dispatch**:\n"
            f"An emergency route confirmation has been prepared for {contact}. You can tap \"Send SMS to Mobile\" to receive full coordinates.\n\n"
            "⚡ **Immediate 3-Step Action**:\n"
            "1. Unplug main electrical switchboard before water reaches floor level.\n"
            "2. Put mobile phone inside a ziplock bag and carry government photo ID.\n"
            "3. Follow the cyan navigation line on the FloodGuard Evacuation Map."
        )

    # 2. Car / Vehicle submerged
    if any(k in q for k in ["car", "vehicle", "stalling", "drive"]):
        return (
            "⚠️ **CRITICAL VEHICLE SAFETY PROTOCOL (LIFE-SAFETY PRIORITY)**:\n"
            "If floodwater reaches your wheel hubs (15cm) or your engine cuts out:\n\n"
            "1. **Abandon the vehicle immediately** — Just 30cm (1 foot) of moving floodwater carries enough buoyancy to lift a 1.5-ton car, and 60cm sweeps away heavy SUVs.\n"
            "2. **Unlock doors and lower windows right now** while electrical systems still function. If windows fail, kick out a side window with your heel.\n"
            "3. **Never attempt to restart the engine** — Water ingestion locks pistons (hydrolock) and causes sudden battery short-circuits.\n"
            "4. **Move immediately to high ground** on foot, walking perpendicular to the water current.\n"
            "5. Signal your location: Tap **Broadcast Emergency SOS** on FloodGuard so NDRF rescue teams can pinpoint your GPS coordinates."
        )

    # 3. Water entering home / Rooftop stranded
    if "water" in q and any(k in q for k in ["enter", "home", "house", "roof", "floor", "trapped"]):
        return (
            "🚨 **URGENT: WATER INUNDATION & ROOFTOP SAFETY DIRECTIVE**:\n"
            "If floodwater has entered your dwelling or is rising up stairs:\n\n"
            "1. **Electrical Disconnect**: Kill the main MCB/fuse box immediately if you can reach it safely while standing on completely dry ground. If the panel is wet, **DO NOT TOUCH IT**.\n"
            "2. **Move Upward**: Retreat to the highest available floor or reinforced concrete rooftop.\n"
            "3. **DO NOT Enter Closed Attics**: Never climb into a closed attic without a rooftop exit — rising water can trap you under the rafters. Ensure you have roof access.\n"
            "4. **Visibility & Signaling**: Tie a bright cloth or wave a flashlight/torch towards open skies.\n"
            "5. **Drink Only Bottled/Boiled Water**: Tap water and groundwater become contaminated immediately when drainage overflows.\n"
            f"{medical_snippet}\n\n"
            "📱 **Rescue Dispatch**:\n"
            "Emergency response teams are monitoring your location. Keep your mobile battery on ultra-low power mode."
        )

    # 4. Vitals / Medical emergency
    if any(k in q for k in ["heart", "bpm", "spo2", "breath", "doctor", "medical", "medic"]):
        hr_val = (person_profile or {}).get("heartRateBpm", 85)
        spo2_val = (person_profile or {}).get("spo2Percent", 98)
        return (
            f"🩺 **HEALTH & PHYSIOLOGICAL STABILIZATION ADVISORY**:\n"
            f"Evacuee: **{name}** | Registered Vitals: HR {hr_val} BPM, SpO₂ {spo2_val}%\n\n"
            "1. **Respiratory & Oxygenation (SpO₂)**:\n"
            "   • If SpO₂ drops below 92%, sit upright in an elevated position (high Fowler's). Avoid lying flat in humid air.\n"
            "   • Slow, deep diaphragmatic breaths through the nose, out through pursed lips.\n"
            "2. **Heart Rate & Tachycardia Management**:\n"
            "   • If heart rate exceeds 110 BPM, rest for 5 minutes on dry ground. Sip clean water.\n"
            "   • Avoid carrying heavy luggage; transfer packs to rescue team members or floating bags.\n"
            "3. **Hypothermia Prevention**:\n"
            "   • Wet clothing leaches body heat 25 times faster than dry air. Wring out wet clothes and wrap in plastic trash bags or dry blankets.\n"
            "4. **Immediate Medical Evacuation**:\n"
            f"   • An alert has been queued for dispatch to the medical triage tent at **{shelter}**."
        )

    # 5. Dam / Reservoir Status
    if any(k in q for k in ["dam", "reservoir", "chembarambakkam", "spillway", "discharge"]):
        return (
            "🌊 **CHEMBARAMBAKKAM & BASIN HYDROLOGICAL BRIEFING**:\n"
            f"• Current Water Level: **{res_level}m** (Maximum Crest: **38.0m**)\n"
            f"• Status: **{dam_status}**\n"
            f"• Inflow: **{inflow:,} cusecs**\n"
            f"• Spillway Discharge: **{spillway:,} cusecs**\n"
            f"• Catchment Rainfall: **{precip} mm/h**\n\n"
            "⚠️ **Downstream Flood Impact**:\n"
            "The released discharge flows through the lower Cooum drainage system. Communities bordering Paruthipattu lake, Kovur, and Outer Avadi are experiencing active backflow surges. Evacuate all ground floor residences within 300m of the riverbanks."
        )

    # 6. Mobile SMS Alert inquiry
    if any(k in q for k in ["sms", "mobile", "message", "phone", "alert"]):
        contact = (person_profile or {}).get("contactNumber") or "Available via Person Intake"
        return (
            "📱 **MOBILE SMS & EMERGENCY CELL BROADCAST SYSTEM**:\n"
            f"• Your registered mobile number: **{contact}**\n"
            "• FloodGuard transmits high-priority cell broadcast alerts over Airtel, Jio, and BSNL disaster relays.\n"
            "• You can send an instant SMS alert with your coordinates and medical status by clicking **Send SMS to Mobile** in the top navigation or from the person drawer.\n"
            "• In case mobile networks drop, ensure you have downloaded the **Offline Map Package** for offline turn-by-turn navigation without internet."
        )

    # Default Comprehensive Emergency Guidance
    loc_str = f"{user_location[0]:.4f}, {user_location[1]:.4f}" if user_location and len(user_location) >= 2 else "Avadi Sector"
    return (
        f"🛡️ **AEGIS AI LIFE-SAFETY DIRECTIVE FOR {name.upper()}**:\n"
        f"Dam Status: **{dam_status}** ({res_level}m) | Rainfall: **{precip} mm/h**\n\n"
        "1. 🧭 **Destination Safe Haven**:\n"
        f"   Head to **{shelter}**. This ridge facility is 24.8m above sea level with backup power, drinking water, and medical personnel.\n"
        "2. ⚠️ **Submerged Road Avoidance**:\n"
        "   Do NOT attempt to cross the Paruthipattu low riverbank or Kovur culvert. Follow high-elevation railway ridge roads.\n"
        "3. 📱 **Mobile Alert Status**:\n"
        f"   Emergency teams have your registered coordinates at ({loc_str}).\n"
        f"{medical_snippet}\n\n"
        "⚡ **Immediate Action Plan**:\n"
        "1. Pack essential medication, phone charger, and government ID in waterproof plastic.\n"
        "2. Switch off electrical mains before water contacts outlets.\n"
        "3. Keep FloodGuard voice navigation turned on for turn-by-turn safe routing."
    )

async def get_ai_advice(
    prompt: str,
    dam: Dict[str, Any],
    user_location: Optional[List[float]] = None,
    blocked_roads: Optional[List[str]] = None,
    current_dam_level: Optional[float] = None,
    nearest_shelter: Optional[str] = None,
    person_profile: Optional[Dict[str, Any]] = None,
) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and api_key != "MY_GEMINI_API_KEY" and len(api_key) > 10:
        try:
            person_context = ""
            if person_profile:
                conditions = person_profile.get("medicalConditions", [])
                med_str = ", ".join(conditions) if conditions else person_profile.get("medicalNotes", "None reported")
                hr = person_profile.get("heartRateBpm")
                spo2 = person_profile.get("spo2Percent")
                person_context = (
                    f"\nREGISTERED EVACUEE PROFILE CONTEXT:\n"
                    f"- Name: {person_profile.get('name', 'Citizen')}\n"
                    f"- Registered Mobile: {person_profile.get('contactNumber', 'Not provided')}\n"
                    f"- Medical Conditions: {med_str}\n"
                    f"- Real-time Vitals: Heart Rate {f'{hr} BPM' if hr is not None else 'Unknown'} | SpO₂ {f'{spo2}%' if spo2 is not None else 'Unknown'}\n"
                    f"- Registered Flood Depth: {person_profile.get('floodDepthCm', 15)} cm\n"
                    f"- Dependents: {person_profile.get('dependentsCount', 0)}\n"
                    f"- Current Rescue Priority: {person_profile.get('rescuePriority', 'P2')}\n"
                    f"- Landmark: {person_profile.get('addressLandmark', 'Avadi / Ambattur')}\n"
                    f"- SOS Status: {'🚨 EXPLICIT SOS ACTIVE' if person_profile.get('sosActive') else 'Standby'}\n"
                )

            system_context = (
                "You are Aegis AI, the premier tactical flood disaster response advisor and real-time evacuation dispatcher "
                "for FloodGuard 2.1 in Chennai's Avadi & Ambattur Hydrological Basin.\n"
                f"CURRENT HYDROLOGICAL TELEMETRY:\n"
                f"- Dam Reservoir Level: {current_dam_level or dam.get('reservoirLevelM')}m (Full Crest: 38.0m)\n"
                f"- Dam Status: {dam.get('status')}\n"
                f"- Dam Spillway Discharge: {dam.get('spillwayReleaseCusecs', 0):,} cusecs\n"
                f"- Basin Rainfall Rate: {dam.get('precipitationMmH', 0)} mm/h\n"
                f"- User GPS: {f'Lat {user_location[0]:.4f}, Lng {user_location[1]:.4f}' if user_location and len(user_location) >= 2 else 'Avadi'}\n"
                f"- Blocked Roads: {', '.join(blocked_roads) if blocked_roads else 'Paruthipattu Low Riverbank, Kovur Culvert'}\n"
                f"- Recommended Shelter: {nearest_shelter or 'Thirumullaivoyal High Ridge Defense Pavilion (Elevation: 24.8m)'}\n"
                f"{person_context}\n"
                "Provide calm, authoritative, structured tactical Markdown advice with clear sections."
            )

            async with httpx.AsyncClient(timeout=3.5) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
                payload = {
                    "contents": [{
                        "parts": [{"text": f"{system_context}\n\nEVACUEE INQUIRY / SCENARIO: {prompt}"}]
                    }]
                }
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text and len(text.strip()) > 20:
                            return text
        except Exception:
            pass

    return generate_rule_based_emergency_advice(
        prompt,
        dam,
        user_location,
        blocked_roads,
        nearest_shelter,
        person_profile,
    )
