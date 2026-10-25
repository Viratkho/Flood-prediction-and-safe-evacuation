from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from backend.services.weather_service import (
    get_weather_forecast,
    search_cities,
    get_local_weather_news,
    get_global_weather_news,
)

router = APIRouter()

@router.get("/api/weather")
async def get_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    city: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
):
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

    data = await get_weather_forecast(lat=lat, lon=actual_lon, city=city or "Unknown", country=country or "Unknown")
    return data

@router.get("/api/weather/search")
async def search_weather_locations(q: Optional[str] = Query(None)):
    if not q or not q.strip():
        return {"results": []}
    results = await search_cities(q.strip())
    return {"results": results}

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
