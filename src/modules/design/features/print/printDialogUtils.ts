import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pointInBounds = (
  lng: number,
  lat: number,
  [minLat, minLng, maxLat, maxLng]: [number, number, number, number]
) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
