from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from backend.services.weather_service import (
    get_weather_forecast,
    search_cities,
    get_floodguard_news,
    get_local_weather_news,
    get_global_weather_news,
)

router = APIRouter(tags=["Weather & News"])

@router.get("/api/weather")
async def get_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    city: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
):
    """
    Main weather endpoint: fetches or retrieves cached Open-Meteo observations and 7-day forecast.
    """
    actual_lon = lon if lon is not None else lng
    if lat is None or actual_lon is None:
        return JSONResponse(
            status_code=400,
            content={"error": "Latitude and longitude query parameters are required"},
        )

    if lat < -90 or lat > 90 or actual_lon < -180 or actual_lon > 180:
        return JSONResponse(
            status_code=400,
            content={"error": "Coordinates out of bounds. Latitude must be between -90 and 90, longitude between -180 and 180."},
        )

    data = await get_weather_forecast(
        lat=lat,
        lon=actual_lon,
        city=city or "Avadi Basin, Chennai",
        region=region or "Tamil Nadu",
        country=country or "India"
    )
    return data

@router.get("/api/weather/current")
async def get_current_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
):
    """
    Returns only the current atmospheric condition and observations.
    """
    actual_lon = lon if lon is not None else lng
    if lat is None or actual_lon is None:
        return JSONResponse(
            status_code=400,
            content={"error": "Latitude and longitude query parameters are required"},
        )
    data = await get_weather_forecast(lat=lat, lon=actual_lon)
    if not data.get("success"):
        return JSONResponse(status_code=503, content=data)
    return {
        "success": True,
        "location": data.get("location"),
        "current": data.get("current"),
        "isCached": data.get("isCached", False),
        "lastUpdated": data.get("lastUpdated"),
    }

@router.get("/api/weather/forecast")
async def get_forecast_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
):
    """
    Returns the hourly and 7-day extended meteorological forecast.
    """
    actual_lon = lon if lon is not None else lng
    if lat is None or actual_lon is None:
        return JSONResponse(
            status_code=400,
            content={"error": "Latitude and longitude query parameters are required"},
        )
    data = await get_weather_forecast(lat=lat, lon=actual_lon)
    if not data.get("success"):
        return JSONResponse(status_code=503, content=data)
    return {
        "success": True,
        "location": data.get("location"),
        "hourly": data.get("hourly", []),
        "daily": data.get("daily", []),
        "isCached": data.get("isCached", False),
        "lastUpdated": data.get("lastUpdated"),
    }

@router.get("/api/weather/search")
async def search_weather_locations(q: Optional[str] = Query(None)):
    if not q or not q.strip():
        return {"results": []}
    results = await search_cities(q.strip())
    return {"results": results}

@router.get("/api/news")
async def get_news(
    category: Optional[str] = Query("all"),
    limit: Optional[int] = Query(50),
):
    """
    Standardized FloodGuard RSS news endpoint.
    Filters: category in ['all', 'chennai', 'tamilnadu', 'flood_alerts', 'disaster_mgmt']
    """
    data = await get_floodguard_news(category=category or "all", limit=limit or 50)
    return data

@router.get("/api/weather/news/local")
async def get_local_news(
    location: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    countryCode: Optional[str] = Query(None),
):
    search_q = query or location or "Chennai"
    data = await get_local_weather_news(
        query=search_q,
        country=country or "",
        country_code=countryCode or "",
    )
    return data

@router.get("/api/weather/news/global")
async def get_global_news():
    data = await get_global_weather_news()
    return data
