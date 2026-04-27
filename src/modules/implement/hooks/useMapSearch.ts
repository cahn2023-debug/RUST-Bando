import { useState, useEffect, useCallback } from 'react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { isMatchSearch, getParsedCoordinates, calculateFeatureNumbers } from '@TOOL/utils/featureUtils';

export interface SearchResult {
  id: string;
  name: string;
  type: 'local' | 'external';
  subType?: string;
  coordinates: [number, number]; // [lat, lng] for internal consistency in results
  metadata?: any;
}

export const useMapSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const state = useDesignSync(s => s.state);
  const features = state?.features || {};

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const localResults: SearchResult[] = [];
    const q = searchQuery.toLowerCase().trim();

    // Calculate feature numbers once for the search session
    const featuresList = Object.values(features);
    const featureNumbers = calculateFeatureNumbers(featuresList, features);

    // 1. Local Search
    featuresList.forEach((f: any) => {
      if (isMatchSearch(f, q, featureNumbers)) {
        const coords = getParsedCoordinates(f);
        if (coords && Array.isArray(coords)) {
          // Convert [lng, lat] to [lat, lng] if it's a point
          const latLng: [number, number] = f.geom_type === 'Polygon' || f.geom_type === 'LineString'
            ? [0, 0] // We handle bounds for non-points later if needed, or just take first point
            : [coords[1], coords[0]];

          // If polygon/line, get representative point or just skip for now as primarily we search for points
          if (f.geom_type === 'Polygon' && Array.isArray(coords[0])) {
            latLng[0] = coords[0][0][1];
            latLng[1] = coords[0][0][0];
          } else if (f.geom_type === 'LineString' && Array.isArray(coords[0])) {
            latLng[0] = coords[0][1];
            latLng[1] = coords[0][0];
          }

          localResults.push({
            id: f.id,
            name: f.name || f.id,
            type: 'local',
            subType: f.geom_type,
            coordinates: latLng,
            metadata: f
          });
        }
      }
    });

    // 2. External Search (Nominatim)
    let externalResults: SearchResult[] = [];
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        externalResults = data.map((item: any) => ({
          id: `ext-${item.place_id}`,
          name: item.display_name,
          type: 'external',
          subType: item.type,
          coordinates: [parseFloat(item.lat), parseFloat(item.lon)],
          metadata: item
        }));
      }
    } catch (error) {
      console.error("Map search external API error:", error);
    }

    setResults([...localResults, ...externalResults]);
    setLoading(false);
  }, [features]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) performSearch(query);
      else setResults([]);
    }, 400);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  return { query, setQuery, results, loading };
};
