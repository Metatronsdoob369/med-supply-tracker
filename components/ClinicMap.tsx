'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Clinic {
  id: string
  name: string
  address: string
  state: string
  lat: number
  lng: number
}

interface ClinicMapProps {
  clinics: Clinic[]
  inventory: any[]
  onClinicClick?: (clinicId: string) => void
  selectedClinic?: string | null
}

export function ClinicMap({ clinics, inventory, onClinicClick, selectedClinic }: ClinicMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<{ [key: string]: L.Marker }>({})

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize map
    if (!mapRef.current) {
      const map = L.map('clinic-map', {
        center: [32.0, -95.0], // Center on region (LA, TX, AL, GA)
        zoom: 6,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map)

      mapRef.current = map
    }

    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => marker.remove())
    markersRef.current = {}

    // Add markers for each clinic
    clinics.forEach(clinic => {
      const worstStatus = getClinicWorstStatus(clinic.id, inventory)
      const color = getStatusColor(worstStatus)

      const icon = L.divIcon({
        className: 'custom-clinic-marker',
        html: `
          <div style="position: relative;">
            <div style="
              width: 24px;
              height: 24px;
              background: ${color};
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ${worstStatus === 'critical' ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
            "></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const marker = L.marker([clinic.lat, clinic.lng], { icon })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="min-width: 150px;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${clinic.name}</div>
            <div style="font-size: 12px; color: #666;">${clinic.address}</div>
            <div style="margin-top: 6px; padding: 4px 8px; background: ${color}20; border-left: 3px solid ${color}; font-size: 11px; font-weight: 600; text-transform: uppercase;">
              Status: ${worstStatus}
            </div>
          </div>
        `)

      marker.on('click', () => {
        if (onClinicClick) {
          onClinicClick(clinic.id)
        }
      })

      markersRef.current[clinic.id] = marker
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [clinics, inventory, onClinicClick])

  return (
    <>
      <div id="clinic-map" style={{ height: '100%', width: '100%', minHeight: '400px' }} />
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </>
  )
}

function getClinicWorstStatus(clinicId: string, inventory: any[]): string {
  const items = inventory.filter((i: any) => i.clinic_id === clinicId)
  if (items.some((i: any) => i.status === 'critical')) return 'critical'
  if (items.some((i: any) => i.status === 'red')) return 'red'
  if (items.some((i: any) => i.status === 'yellow')) return 'yellow'
  return 'green'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'critical': return '#991b1b' // deep clinical red
    case 'red': return '#c2410c' // burnt orange (surgical alert)
    case 'yellow': return '#ca8a04' // amber (caution)
    case 'green': return '#0d9488' // medical teal (healthy)
    default: return '#0d9488'
  }
}
