'use client'

import React, { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { callAIAgent } from '@/lib/aiAgent'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

// Import ClinicMap dynamically with no SSR to avoid Leaflet window errors
const ClinicMap = dynamic(() => import('@/components/ClinicMap').then(mod => mod.ClinicMap), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted/20">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
})
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  FiMap, FiCamera, FiShoppingCart, FiList, FiSettings,
  FiBell, FiMenu, FiX, FiPlus, FiMinus, FiEdit2, FiTrash2,
  FiCheck, FiAlertTriangle, FiPackage, FiSearch, FiChevronDown,
  FiChevronUp, FiLoader, FiSend, FiCrosshair, FiMapPin,
  FiActivity, FiClock, FiMail
} from 'react-icons/fi'

// ─── Hydration-safe mount tracker ────────────────────────────
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted
}

// ─── Agent IDs ───────────────────────────────────────────────
const INVENTORY_AGENT_ID = '69983a314855ba34a5a0eba7'
const ORDER_AGENT_ID = '69983a320b3f0d6fd42f79f4'
const NOTIFICATION_AGENT_ID = '69983a480b3f0d6fd42f79f9'

// ─── Types ───────────────────────────────────────────────────
interface Clinic {
  id: string
  name: string
  address: string
  state: string
  lat: number
  lng: number
}

interface Product {
  id: string
  name: string
  sku: string
  min_threshold: number
  max_threshold: number
}

interface InventoryItem {
  id: string
  product_id: string
  product_name: string
  sku: string
  clinic_id: string
  clinic_name: string
  current_count: number
  min_threshold: number
  status: 'green' | 'yellow' | 'red' | 'critical'
  last_updated: string
}

interface ScanRecord {
  id: string
  product_name: string
  product_id: string
  clinic_name: string
  clinic_id: string
  current_count: number
  status: string
  timestamp: string
  validated: boolean
}

interface OrderRecommendation {
  item_name: string
  sku: string
  total_quantity_needed: number
  breakdown_by_clinic: Array<{ clinic_name: string; quantity: number }>
  priority: 'critical' | 'high' | 'medium'
  estimated_unit_cost: number
  justification: string
  approved: boolean
  edited_quantity: number
}

interface StatusMessage {
  type: 'success' | 'error' | 'info'
  text: string
}

// ─── REAL OMS CLINIC LOCATIONS (David Ashley Oral Surgery Practice) ──
const SAMPLE_CLINICS: Clinic[] = [
  { id: 'clinic-001', name: 'Monroe Clinic', address: 'Monroe, LA', state: 'LA', lat: 32.5093, lng: -92.1193 },
  { id: 'clinic-002', name: 'Lafayette Clinic', address: 'Lafayette, LA', state: 'LA', lat: 30.2241, lng: -92.0198 },
  { id: 'clinic-003', name: 'Lake Charles Clinic', address: 'Lake Charles, LA', state: 'LA', lat: 30.2266, lng: -93.2174 },
  { id: 'clinic-004', name: 'Cedar Park Clinic', address: 'Cedar Park, TX', state: 'TX', lat: 30.5052, lng: -97.8203 },
  { id: 'clinic-005', name: 'Arlington Clinic', address: 'Arlington, TX', state: 'TX', lat: 32.7357, lng: -97.1081 },
  { id: 'clinic-006', name: 'Trussville Clinic', address: 'Trussville, AL', state: 'AL', lat: 33.6198, lng: -86.6089 },
  { id: 'clinic-007', name: 'Dacula Clinic', address: 'Dacula, GA', state: 'GA', lat: 33.9879, lng: -83.8974 },
  { id: 'clinic-008', name: 'Killeen Clinic', address: 'Killeen, TX', state: 'TX', lat: 31.1171, lng: -97.7278 },
]

const SAMPLE_PRODUCTS: Product[] = [
  // McKesson OSWT SILO START products (extracted from OSWT Inventory List)
  { id: 'prod-001', name: 'McKesson Exam Gloves (Nitrile, L)', sku: 'S636GX', min_threshold: 10, max_threshold: 50 },
  { id: 'prod-002', name: 'McKesson Exam Gloves (Nitrile, M)', sku: 'SJ496GX', min_threshold: 10, max_threshold: 50 },
  { id: 'prod-003', name: 'McKesson Exam Table Paper 21"x225\'', sku: '58-204', min_threshold: 8, max_threshold: 30 },
  { id: 'prod-004', name: 'Graham Field Exam Table Paper', sku: '2990', min_threshold: 8, max_threshold: 30 },
  { id: 'prod-005', name: 'Cardinal Exam Gloves (Latex, S)', sku: '8881400033', min_threshold: 6, max_threshold: 30 },
  { id: 'prod-006', name: 'Cardinal Exam Gloves (Latex, M)', sku: '8881400058', min_threshold: 6, max_threshold: 30 },
  { id: 'prod-007', name: 'C2R Rx Destroyer (Drug Disposal)', sku: 'RX16', min_threshold: 4, max_threshold: 15 },
  { id: 'prod-008', name: 'Graham Medical Exam Table Paper 18"', sku: '43447', min_threshold: 8, max_threshold: 30 },
  // Standard oral surgery supplies (from OSWT Master Supply Order List categories)
  { id: 'prod-009', name: 'Dental Anesthetic Cartridges (Lido 2%)', sku: 'DAC-LIDO', min_threshold: 15, max_threshold: 60 },
  { id: 'prod-010', name: 'Suture Kit (Chromic Gut 4-0)', sku: 'SK-CG40', min_threshold: 8, max_threshold: 30 },
  { id: 'prod-011', name: 'Disposable Scalpel Blades (#15C)', sku: 'DSB-15C', min_threshold: 12, max_threshold: 40 },
  { id: 'prod-012', name: 'Bone Graft Material (0.5cc)', sku: 'BGM-05CC', min_threshold: 5, max_threshold: 20 },
  { id: 'prod-013', name: 'Irrigation Syringes (12ml Monoject)', sku: 'IS-12ML', min_threshold: 15, max_threshold: 50 },
  { id: 'prod-014', name: 'Hemostatic Gelatin Sponge (Gelfoam)', sku: 'HGS-GF', min_threshold: 6, max_threshold: 25 },
  { id: 'prod-015', name: 'Sterile Gauze 4x4 (Pk/200)', sku: 'SG-4X4', min_threshold: 10, max_threshold: 40 },
  { id: 'prod-016', name: 'Surgical Aspirator Tips (Yankauer)', sku: 'SAT-YK', min_threshold: 10, max_threshold: 35 },
]

const SAMPLE_INVENTORY: InventoryItem[] = [
  // Monroe Clinic — well stocked mostly, low on anesthetic
  { id: 'inv-001', product_id: 'prod-001', product_name: 'McKesson Exam Gloves (Nitrile, L)', sku: 'S636GX', clinic_id: 'clinic-001', clinic_name: 'Monroe Clinic', current_count: 32, min_threshold: 10, status: 'green', last_updated: '2026-02-20T08:30:00Z' },
  { id: 'inv-002', product_id: 'prod-003', product_name: 'McKesson Exam Table Paper 21"x225\'', sku: '58-204', clinic_id: 'clinic-001', clinic_name: 'Monroe Clinic', current_count: 18, min_threshold: 8, status: 'green', last_updated: '2026-02-20T08:30:00Z' },
  { id: 'inv-003', product_id: 'prod-009', product_name: 'Dental Anesthetic Cartridges (Lido 2%)', sku: 'DAC-LIDO', clinic_id: 'clinic-001', clinic_name: 'Monroe Clinic', current_count: 7, min_threshold: 15, status: 'red', last_updated: '2026-02-19T14:00:00Z' },
  // Lafayette Clinic — low on several, critical bone graft
  { id: 'inv-006', product_id: 'prod-002', product_name: 'McKesson Exam Gloves (Nitrile, M)', sku: 'SJ496GX', clinic_id: 'clinic-002', clinic_name: 'Lafayette Clinic', current_count: 11, min_threshold: 10, status: 'yellow', last_updated: '2026-02-19T16:00:00Z' },
  { id: 'inv-007', product_id: 'prod-011', product_name: 'Disposable Scalpel Blades (#15C)', sku: 'DSB-15C', clinic_id: 'clinic-002', clinic_name: 'Lafayette Clinic', current_count: 3, min_threshold: 12, status: 'red', last_updated: '2026-02-18T10:00:00Z' },
  { id: 'inv-008', product_id: 'prod-012', product_name: 'Bone Graft Material (0.5cc)', sku: 'BGM-05CC', clinic_id: 'clinic-002', clinic_name: 'Lafayette Clinic', current_count: 0, min_threshold: 5, status: 'critical', last_updated: '2026-02-17T09:00:00Z' },
  // Lake Charles Clinic — mixed, critical hemostatic
  { id: 'inv-010', product_id: 'prod-015', product_name: 'Sterile Gauze 4x4 (Pk/200)', sku: 'SG-4X4', clinic_id: 'clinic-003', clinic_name: 'Lake Charles Clinic', current_count: 9, min_threshold: 10, status: 'yellow', last_updated: '2026-02-20T07:00:00Z' },
  { id: 'inv-011', product_id: 'prod-013', product_name: 'Irrigation Syringes (12ml Monoject)', sku: 'IS-12ML', clinic_id: 'clinic-003', clinic_name: 'Lake Charles Clinic', current_count: 4, min_threshold: 15, status: 'red', last_updated: '2026-02-19T11:00:00Z' },
  { id: 'inv-012', product_id: 'prod-014', product_name: 'Hemostatic Gelatin Sponge (Gelfoam)', sku: 'HGS-GF', clinic_id: 'clinic-003', clinic_name: 'Lake Charles Clinic', current_count: 0, min_threshold: 6, status: 'critical', last_updated: '2026-02-18T15:00:00Z' },
  // Cedar Park Clinic — mostly stocked
  { id: 'inv-014', product_id: 'prod-001', product_name: 'McKesson Exam Gloves (Nitrile, L)', sku: 'S636GX', clinic_id: 'clinic-004', clinic_name: 'Cedar Park Clinic', current_count: 28, min_threshold: 10, status: 'green', last_updated: '2026-02-20T09:00:00Z' },
  { id: 'inv-015', product_id: 'prod-009', product_name: 'Dental Anesthetic Cartridges (Lido 2%)', sku: 'DAC-LIDO', clinic_id: 'clinic-004', clinic_name: 'Cedar Park Clinic', current_count: 22, min_threshold: 15, status: 'green', last_updated: '2026-02-20T09:00:00Z' },
  // Arlington Clinic — critically low on multiple items
  { id: 'inv-017', product_id: 'prod-010', product_name: 'Suture Kit (Chromic Gut 4-0)', sku: 'SK-CG40', clinic_id: 'clinic-005', clinic_name: 'Arlington Clinic', current_count: 2, min_threshold: 8, status: 'red', last_updated: '2026-02-19T13:00:00Z' },
  { id: 'inv-018', product_id: 'prod-011', product_name: 'Disposable Scalpel Blades (#15C)', sku: 'DSB-15C', clinic_id: 'clinic-005', clinic_name: 'Arlington Clinic', current_count: 0, min_threshold: 12, status: 'critical', last_updated: '2026-02-17T16:00:00Z' },
  // Trussville Clinic
  { id: 'inv-021', product_id: 'prod-001', product_name: 'McKesson Exam Gloves (Nitrile, L)', sku: 'S636GX', clinic_id: 'clinic-006', clinic_name: 'Trussville Clinic', current_count: 15, min_threshold: 10, status: 'green', last_updated: '2026-02-20T09:00:00Z' },
  { id: 'inv-022', product_id: 'prod-015', product_name: 'Sterile Gauze 4x4 (Pk/200)', sku: 'SG-4X4', clinic_id: 'clinic-006', clinic_name: 'Trussville Clinic', current_count: 8, min_threshold: 10, status: 'yellow', last_updated: '2026-02-20T09:00:00Z' },
  // Dacula Clinic
  { id: 'inv-023', product_id: 'prod-002', product_name: 'McKesson Exam Gloves (Nitrile, M)', sku: 'SJ496GX', clinic_id: 'clinic-007', clinic_name: 'Dacula Clinic', current_count: 25, min_threshold: 10, status: 'green', last_updated: '2026-02-20T09:00:00Z' },
  // Killeen Clinic
  { id: 'inv-024', product_id: 'prod-009', product_name: 'Dental Anesthetic Cartridges (Lido 2%)', sku: 'DAC-LIDO', clinic_id: 'clinic-008', clinic_name: 'Killeen Clinic', current_count: 5, min_threshold: 15, status: 'red', last_updated: '2026-02-20T09:00:00Z' },
  { id: 'inv-025', product_id: 'prod-012', product_name: 'Bone Graft Material (0.5cc)', sku: 'BGM-05CC', clinic_id: 'clinic-008', clinic_name: 'Killeen Clinic', current_count: 2, min_threshold: 5, status: 'yellow', last_updated: '2026-02-20T09:00:00Z' },
]

// ─── OSWT Reference Files (uploaded assets for agent context) ──
const OSWT_ASSETS = {
  checklist: 'https://asset.lyzr.app/CAqEhpNf',
  inventoryList: 'https://asset.lyzr.app/QoqZ8ddl',
  masterSupplyOrder: 'https://asset.lyzr.app/4P10SBS6',
}

// ─── Status Config ───────────────────────────────────────────
const statusConfig: Record<string, { label: string; bgClass: string }> = {
  green: { label: 'Stocked', bgClass: 'bg-green-900/40 text-green-400 border border-green-700/50' },
  yellow: { label: 'Low', bgClass: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/50' },
  red: { label: 'Order Needed', bgClass: 'bg-red-900/40 text-red-400 border border-red-700/50' },
  critical: { label: 'Critical', bgClass: 'bg-red-950/60 text-red-300 border border-red-600/50 animate-blink-critical' },
}

// ─── Helpers ─────────────────────────────────────────────────
function getStatusBadge(status: string) {
  const config = statusConfig[status] ?? statusConfig['green']
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgClass}`}>{config.label}</span>
}

function formatDate(dateStr: string, mounted: boolean = true) {
  if (!dateStr) return 'N/A'
  if (!mounted) return '\u00A0' // non-breaking space before mount to avoid mismatch
  try {
    const d = new Date(dateStr)
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
    const day = d.getDate()
    const hours = d.getHours()
    const mins = d.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const h12 = hours % 12 || 12
    return `${month} ${day}, ${h12}:${mins} ${ampm}`
  } catch (_e) {
    return dateStr
  }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

function getClinicWorstStatus(clinicId: string, inventory: InventoryItem[]): string {
  const items = inventory.filter(i => i.clinic_id === clinicId)
  if (items.some(i => i.status === 'critical')) return 'critical'
  if (items.some(i => i.status === 'red')) return 'red'
  if (items.some(i => i.status === 'yellow')) return 'yellow'
  return 'green'
}

const priorityConfig: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-red-900/50 text-red-300 border-red-600/50' },
  high: { label: 'High', cls: 'bg-orange-900/50 text-orange-300 border-orange-600/50' },
  medium: { label: 'Medium', cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-600/50' },
}

// ─── Navigation Items ────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: FiMap },
  { id: 'scan', label: 'Scan Inventory', icon: FiCamera },
  { id: 'orders', label: 'Order Review', icon: FiShoppingCart },
  { id: 'inventory', label: 'Inventory List', icon: FiList },
  { id: 'settings', label: 'Settings', icon: FiSettings },
]

// ─── ErrorBoundary ───────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({ activeScreen, setActiveScreen, collapsed, setCollapsed }: {
  activeScreen: string
  setActiveScreen: (s: string) => void
  collapsed: boolean
  setCollapsed: (c: boolean) => void
}) {
  return (
    <div className={`flex-shrink-0 h-screen sticky top-0 bg-[hsl(20,28%,6%)] border-r border-border flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="p-4 flex items-center justify-between border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#90EE90]/20 flex items-center justify-center">
              <FiCrosshair className="w-4 h-4 text-[#90EE90]" />
            </div>
            <span className="font-serif font-bold text-lg text-white tracking-tight">XTrackedOS</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-md hover:bg-white/10 active:bg-white/20 transition-all text-[#90EE90] hover:text-[#98FB98]">
          <FiMenu className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeScreen === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive ? 'bg-[#90EE90]/20 text-[#90EE90] border border-[#90EE90]/40' : 'text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20'}`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 text-[#90EE90]`} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
      {!collapsed && (
        <div className="border-t border-border">
          <div className="p-4">
            <div className="text-xs text-white/50">Inventory Manager</div>
            <div className="text-xs text-white/50 mt-1">v2.1.0</div>
          </div>
          <div className="px-4 pb-4">
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/30 active:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-800/30 hover:border-red-700/50 transition-all text-xs font-medium">
              <FiX className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────
function HeaderBar({ activeScreen, notificationCount }: { activeScreen: string; notificationCount: number }) {
  const title = NAV_ITEMS.find(n => n.id === activeScreen)?.label ?? 'Dashboard'
  return (
    <div className="h-14 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-lg font-semibold text-white">{title}</h1>
        <span className="text-xs text-white/70 bg-secondary px-2 py-0.5 rounded-full">Inventory Manager</span>
      </div>
      <div className="relative">
        <button className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-all text-[#90EE90] hover:text-[#98FB98]">
          <FiBell className="w-5 h-5" />
        </button>
        {notificationCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{notificationCount}</span>
        )}
      </div>
    </div>
  )
}

// ─── Status Message Banner ───────────────────────────────────
function StatusBanner({ message, onClose }: { message: StatusMessage; onClose: () => void }) {
  const cls = message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-700/40' : message.type === 'error' ? 'bg-red-900/30 text-red-400 border border-red-700/40' : 'bg-[hsl(36,60%,31%)]/20 text-[hsl(36,60%,50%)] border border-[hsl(36,60%,31%)]/40'
  return (
    <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 text-sm ${cls}`}>
      {message.type === 'success' && <FiCheck className="w-4 h-4 flex-shrink-0" />}
      {message.type === 'error' && <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />}
      {message.type === 'info' && <FiActivity className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{message.text}</span>
      <button onClick={onClose} className="ml-auto flex-shrink-0 hover:opacity-70"><FiX className="w-4 h-4" /></button>
    </div>
  )
}

// ─── Dashboard Screen ────────────────────────────────────────
function DashboardScreen({
  inventory, clinics, products, analysisLoading, setAnalysisLoading, setRecommendations,
  setActiveScreen, setStatusMessage, activeAgentId, setActiveAgentId,
  selectedClinic, setSelectedClinic
}: {
  inventory: InventoryItem[]
  clinics: Clinic[]
  products: Product[]
  analysisLoading: boolean
  setAnalysisLoading: (v: boolean) => void
  setRecommendations: (r: OrderRecommendation[]) => void
  setActiveScreen: (s: string) => void
  setStatusMessage: (m: StatusMessage | null) => void
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
  selectedClinic: string | null
  setSelectedClinic: (id: string | null) => void
}) {
  const [mapAlerts, setMapAlerts] = useState(true)

  const totalClinics = clinics.length
  const belowThreshold = inventory.filter(i => i.status === 'red' || i.status === 'critical').length
  const pendingCritical = inventory.filter(i => i.status === 'critical').length
  const lastScan = inventory.reduce((latest, item) => {
    if (!latest) return item.last_updated
    return item.last_updated > latest ? item.last_updated : latest
  }, '')

  const clinicPositions: Record<string, { left: string; top: string }> = {
    'clinic-001': { left: '30%', top: '65%' },
    'clinic-002': { left: '25%', top: '30%' },
    'clinic-003': { left: '70%', top: '20%' },
    'clinic-004': { left: '45%', top: '60%' },
    'clinic-005': { left: '60%', top: '55%' },
  }

  const statusColors: Record<string, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    critical: 'bg-red-600 animate-blink-critical',
  }

  const handleAnalyze = async () => {
    setAnalysisLoading(true)
    setActiveAgentId(ORDER_AGENT_ID)
    setStatusMessage({ type: 'info', text: 'Analyzing inventory levels and generating order recommendations...' })
    try {
      const snapshot = inventory.map(item => ({
        product_name: item.product_name,
        sku: item.sku,
        clinic_name: item.clinic_name,
        current_count: item.current_count,
        min_threshold: item.min_threshold,
        status: item.status,
      }))
      const payload = {
        context: 'OSWT (Oral Surgery Workforce Team) multi-location inventory. Products sourced from McKesson SILO START catalog and OSWT Master Supply Order List. Analyze and recommend bulk orders.',
        inventory_snapshot: snapshot,
        total_clinics: clinics.length,
        total_products: products.length,
      }
      const result = await callAIAgent(JSON.stringify(payload), ORDER_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result
        const recs = Array.isArray(data?.recommendations) ? data.recommendations : []
        const mapped: OrderRecommendation[] = recs.map((r: Record<string, unknown>) => ({
          item_name: (r?.item_name as string) ?? '',
          sku: (r?.sku as string) ?? '',
          total_quantity_needed: (r?.total_quantity_needed as number) ?? 0,
          breakdown_by_clinic: Array.isArray(r?.breakdown_by_clinic) ? r.breakdown_by_clinic : [],
          priority: (r?.priority as string) ?? 'medium',
          estimated_unit_cost: (r?.estimated_unit_cost as number) ?? 0,
          justification: (r?.justification as string) ?? '',
          approved: true,
          edited_quantity: (r?.total_quantity_needed as number) ?? 0,
        }))
        setRecommendations(mapped)
        const summary = data?.summary
        setStatusMessage({
          type: 'success',
          text: `Analysis complete: ${mapped.length} items to order. Est. cost: $${summary?.total_estimated_cost?.toFixed(2) ?? '0.00'}. ${summary?.clinics_affected ?? 0} clinics affected.`,
        })
        if (mapped.length > 0) {
          setTimeout(() => setActiveScreen('orders'), 1500)
        }
      } else {
        setStatusMessage({ type: 'error', text: result?.error ?? 'Analysis failed. Please try again.' })
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Analysis failed. Please try again.' })
    } finally {
      setAnalysisLoading(false)
      setActiveAgentId(null)
    }
  }

  const selectedClinicData = clinics.find(c => c.id === selectedClinic)
  const selectedClinicInventory = selectedClinic ? inventory.filter(i => i.clinic_id === selectedClinic) : []

  return (
    <div className="space-y-6">
      {/* Interactive Map Card */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FiMapPin className="w-4 h-4 text-[#90EE90]" />
            <CardTitle className="text-sm font-medium text-white">Regional Clinic Map - Live Locations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-96">
            <ClinicMap
              clinics={clinics}
              inventory={inventory}
              onClinicClick={setSelectedClinic}
              selectedClinic={selectedClinic}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">Total Clinics</p>
                <p className="text-2xl font-bold text-white font-serif">{totalClinics}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#90EE90]/10 border border-[#90EE90]/25 flex items-center justify-center">
                <FiMapPin className="w-5 h-5 text-[#90EE90]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">Below Threshold</p>
                <p className="text-2xl font-bold text-white font-serif">{belowThreshold}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#90EE90]/10 border border-[#90EE90]/25 flex items-center justify-center">
                <FiAlertTriangle className="w-5 h-5 text-[#90EE90]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">Critical Items</p>
                <p className="text-2xl font-bold text-white font-serif">{pendingCritical}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#90EE90]/10 border border-[#90EE90]/25 flex items-center justify-center">
                <FiPackage className="w-5 h-5 text-[#90EE90]" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">Last Scan</p>
                <p className="text-lg font-semibold text-white font-serif">{formatDate(lastScan)}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#90EE90]/10 border border-[#90EE90]/25 flex items-center justify-center">
                <FiClock className="w-5 h-5 text-[#90EE90]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OSWT Data Source Banner */}
      <div className="rounded-lg border border-[hsl(36,60%,31%)]/30 bg-[hsl(36,60%,31%)]/10 p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-[#90EE90]/10 flex items-center justify-center flex-shrink-0">
          <FiPackage className="w-4 h-4 text-[#90EE90]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white">OSWT Inventory Loaded</p>
          <p className="text-xs text-white/60 mt-0.5 truncate">
            Sourced from McKesson SILO START list, OSWT Master Supply Order, and Inventory Checklist ({products.length} products / {inventory.length} tracked items)
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a href={OSWT_ASSETS.inventoryList} target="_blank" rel="noopener noreferrer" className="text-xs text-[#90EE90] hover:text-[#98FB98] hover:underline transition-colors">McKesson List</a>
          <span className="text-white/40 text-xs">|</span>
          <a href={OSWT_ASSETS.masterSupplyOrder} target="_blank" rel="noopener noreferrer" className="text-xs text-[#90EE90] hover:text-[#98FB98] hover:underline transition-colors">Master Order</a>
          <span className="text-white/40 text-xs">|</span>
          <a href={OSWT_ASSETS.checklist} target="_blank" rel="noopener noreferrer" className="text-xs text-[#90EE90] hover:text-[#98FB98] hover:underline transition-colors">Checklist</a>
        </div>
      </div>

      {/* Analyze CTA */}
      <Card className="bg-card border-border">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-serif font-semibold text-white">Order Intelligence</h3>
            <p className="text-sm text-white/70 mt-1">Analyze current inventory levels across all clinics and generate smart order recommendations.</p>
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={analysisLoading}
            className="bg-[#90EE90]/20 hover:bg-[#90EE90]/30 active:bg-[#90EE90]/40 text-[#90EE90] border border-[#90EE90]/40 hover:border-[#90EE90]/60 px-6 min-w-[200px] transition-all font-medium"
          >
            {analysisLoading ? (
              <><FiLoader className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
            ) : (
              <><FiActivity className="w-4 h-4 mr-2" />Analyze &amp; Recommend Orders</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Clinic Detail Sheet */}
      <Sheet open={!!selectedClinic} onOpenChange={(open) => { if (!open) setSelectedClinic(null) }}>
        <SheetContent className="bg-card border-border">
          <SheetHeader>
            <SheetTitle className="font-serif text-white">{selectedClinicData?.name ?? 'Clinic Details'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {selectedClinicData && (
              <div className="text-sm text-white/70">
                <p>{selectedClinicData.address}</p>
              </div>
            )}
            <Separator />
            <h4 className="text-sm font-semibold text-white">Inventory Status</h4>
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="space-y-2 pr-4">
                {selectedClinicInventory.length === 0 ? (
                  <p className="text-sm text-white/60">No inventory records for this clinic.</p>
                ) : (
                  selectedClinicInventory.map(item => (
                    <Card key={item.id} className="bg-secondary/50 border-border">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{item.product_name}</p>
                            <p className="text-xs text-white/60">{item.sku}</p>
                          </div>
                          {getStatusBadge(item.status)}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Count: <span className="text-foreground font-medium">{item.current_count}</span></span>
                          <span>Min: {item.min_threshold}</span>
                          <span>{formatDate(item.last_updated)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Scan Screen ─────────────────────────────────────────────
function ScanScreen({
  inventory, setInventory, clinics, products, recentScans, setRecentScans,
  scanLoading, setScanLoading, setStatusMessage, setActiveAgentId
}: {
  inventory: InventoryItem[]
  setInventory: (inv: InventoryItem[]) => void
  clinics: Clinic[]
  products: Product[]
  recentScans: ScanRecord[]
  setRecentScans: (s: ScanRecord[]) => void
  scanLoading: boolean
  setScanLoading: (v: boolean) => void
  setStatusMessage: (m: StatusMessage | null) => void
  setActiveAgentId: (id: string | null) => void
}) {
  const [scanForm, setScanForm] = useState({
    product_name: '',
    product_id: '',
    clinic_id: '',
    current_count: 0,
  })

  const handleProductSelect = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      setScanForm(prev => ({ ...prev, product_id: product.id, product_name: product.name }))
    }
  }

  const handleSubmitCount = async () => {
    if (!scanForm.product_id || !scanForm.clinic_id) {
      setStatusMessage({ type: 'error', text: 'Please select a product and clinic.' })
      return
    }
    setScanLoading(true)
    setActiveAgentId(INVENTORY_AGENT_ID)
    const clinic = clinics.find(c => c.id === scanForm.clinic_id)
    const product = products.find(p => p.id === scanForm.product_id)
    const payload = {
      product_id: scanForm.product_id,
      product_name: scanForm.product_name || product?.name || '',
      clinic_id: scanForm.clinic_id,
      clinic_name: clinic?.name || '',
      current_count: scanForm.current_count,
      min_threshold: product?.min_threshold ?? 10,
    }
    try {
      const result = await callAIAgent(JSON.stringify(payload), INVENTORY_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result
        const newStatus = (data?.status as string) ?? 'green'
        const warnings = Array.isArray(data?.warnings) ? data.warnings : []
        const scan: ScanRecord = {
          id: `scan-${Date.now()}`,
          product_name: (data?.product_name as string) ?? payload.product_name,
          product_id: (data?.product_id as string) ?? payload.product_id,
          clinic_name: (data?.clinic_name as string) ?? payload.clinic_name,
          clinic_id: (data?.clinic_id as string) ?? payload.clinic_id,
          current_count: (data?.current_count as number) ?? payload.current_count,
          status: newStatus,
          timestamp: (data?.timestamp as string) ?? new Date().toISOString(),
          validated: (data?.validated as boolean) ?? true,
        }
        setRecentScans([scan, ...recentScans.slice(0, 4)])
        // Update inventory
        const existingIdx = inventory.findIndex(i => i.product_id === payload.product_id && i.clinic_id === payload.clinic_id)
        if (existingIdx >= 0) {
          const updated = [...inventory]
          updated[existingIdx] = { ...updated[existingIdx], current_count: payload.current_count, status: newStatus as InventoryItem['status'], last_updated: new Date().toISOString() }
          setInventory(updated)
        }
        let msg = (data?.message as string) ?? 'Count submitted successfully.'
        if (warnings.length > 0) {
          msg += ' Warnings: ' + warnings.join(', ')
        }
        setStatusMessage({ type: 'success', text: msg })
        setScanForm({ product_name: '', product_id: '', clinic_id: '', current_count: 0 })
      } else {
        setStatusMessage({ type: 'error', text: result?.error ?? 'Submission failed. Please try again.' })
      }
    } catch (_e) {
      setStatusMessage({ type: 'error', text: 'Submission failed. Please try again.' })
    } finally {
      setScanLoading(false)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* QR Scanner Placeholder */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-serif text-foreground flex items-center gap-2">
            <FiCamera className="w-5 h-5 text-[hsl(36,60%,50%)]" />
            Scan Product
          </CardTitle>
          <CardDescription className="text-muted-foreground">Scan a product QR code or enter details manually below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative w-full aspect-video max-h-48 bg-[hsl(20,30%,6%)] rounded-lg border-2 border-dashed border-[hsl(36,60%,31%)]/40 flex items-center justify-center mb-6">
            {/* Viewfinder corners */}
            <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-[hsl(36,60%,50%)] rounded-tl-sm" />
            <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-[hsl(36,60%,50%)] rounded-tr-sm" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-[hsl(36,60%,50%)] rounded-bl-sm" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-[hsl(36,60%,50%)] rounded-br-sm" />
            <div className="text-center">
              <FiCamera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Camera viewfinder area</p>
              <p className="text-[10px] text-muted-foreground mt-1">Use Manual Entry below</p>
            </div>
          </div>

          {/* Manual Entry Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Product *</Label>
                <Select value={scanForm.product_id} onValueChange={handleProductSelect}>
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Product ID</Label>
                <Input value={scanForm.product_id} readOnly className="bg-input border-border text-foreground" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Clinic Location *</Label>
              <Select value={scanForm.clinic_id} onValueChange={(v) => setScanForm(prev => ({ ...prev, clinic_id: v }))}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {clinics.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} - {c.state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Current Count *</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setScanForm(prev => ({ ...prev, current_count: Math.max(0, prev.current_count - 1) }))} className="border-border text-foreground hover:bg-secondary w-10 h-10">
                  <FiMinus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  value={scanForm.current_count}
                  onChange={(e) => setScanForm(prev => ({ ...prev, current_count: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="bg-input border-border text-foreground text-center w-24"
                />
                <Button variant="outline" size="sm" onClick={() => setScanForm(prev => ({ ...prev, current_count: prev.current_count + 1 }))} className="border-border text-foreground hover:bg-secondary w-10 h-10">
                  <FiPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button
              onClick={handleSubmitCount}
              disabled={scanLoading || !scanForm.product_id || !scanForm.clinic_id}
              className="w-full bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]"
            >
              {scanLoading ? (
                <><FiLoader className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
              ) : (
                <><FiCheck className="w-4 h-4 mr-2" />Submit Count</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Scans */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-serif text-foreground">Recent Scans</CardTitle>
        </CardHeader>
        <CardContent>
          {recentScans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No scans recorded yet. Submit a count above to see it here.</p>
          ) : (
            <div className="space-y-2">
              {recentScans.map(scan => (
                <div key={scan.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{scan.product_name}</p>
                      {getStatusBadge(scan.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{scan.clinic_name}</span>
                      <span>Count: {scan.current_count}</span>
                      <span>{formatDate(scan.timestamp)}</span>
                    </div>
                  </div>
                  {scan.validated && <FiCheck className="w-4 h-4 text-green-400 flex-shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Order Review Screen ─────────────────────────────────────
function OrderReviewScreen({
  recommendations, setRecommendations, orderLoading, setOrderLoading,
  autoOrderMode, setAutoOrderMode, managerEmail, setManagerEmail,
  setStatusMessage, setActiveAgentId
}: {
  recommendations: OrderRecommendation[]
  setRecommendations: (r: OrderRecommendation[]) => void
  orderLoading: boolean
  setOrderLoading: (v: boolean) => void
  autoOrderMode: boolean
  setAutoOrderMode: (v: boolean) => void
  managerEmail: string
  setManagerEmail: (e: string) => void
  setStatusMessage: (m: StatusMessage | null) => void
  setActiveAgentId: (id: string | null) => void
}) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [orderResult, setOrderResult] = useState<Record<string, unknown> | null>(null)

  const toggleExpand = (idx: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const updateQuantity = (idx: number, qty: number) => {
    const updated = [...recommendations]
    updated[idx] = { ...updated[idx], edited_quantity: Math.max(0, qty) }
    setRecommendations(updated)
  }

  const toggleApproval = (idx: number) => {
    const updated = [...recommendations]
    updated[idx] = { ...updated[idx], approved: !updated[idx].approved }
    setRecommendations(updated)
  }

  const removeItem = (idx: number) => {
    setRecommendations(recommendations.filter((_, i) => i !== idx))
  }

  const approvedItems = recommendations.filter(r => r.approved)
  const totalCost = approvedItems.reduce((sum, r) => sum + (r.edited_quantity * r.estimated_unit_cost), 0)

  const handleApproveAndSend = async () => {
    if (approvedItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'No items approved for ordering.' })
      return
    }
    if (!managerEmail.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a manager email address.' })
      return
    }
    setOrderLoading(true)
    setActiveAgentId(NOTIFICATION_AGENT_ID)
    setStatusMessage({ type: 'info', text: 'Sending order confirmation and notifications...' })
    try {
      const payload = {
        context: 'XTrackedOS / OSWT Inventory Management System — order approval for multi-location oral surgery practice. Products sourced from McKesson catalog.',
        approved_items: approvedItems.map(item => ({
          item_name: item.item_name,
          sku: item.sku,
          quantity: item.edited_quantity,
          estimated_unit_cost: item.estimated_unit_cost,
          priority: item.priority,
        })),
        recipient_email: managerEmail,
        order_type: 'purchase_order',
      }
      const result = await callAIAgent(JSON.stringify(payload), NOTIFICATION_AGENT_ID)
      if (result.success) {
        const data = result?.response?.result
        setOrderResult(data as Record<string, unknown>)
        const emailsSent = Array.isArray(data?.emails_sent) ? data.emails_sent : []
        setStatusMessage({
          type: 'success',
          text: `Order submitted! Ref: ${(data?.order_reference as string) ?? 'N/A'}. ${emailsSent.length} email(s) sent.`,
        })
      } else {
        setStatusMessage({ type: 'error', text: result?.error ?? 'Order submission failed.' })
      }
    } catch (_e) {
      setStatusMessage({ type: 'error', text: 'Order submission failed.' })
    } finally {
      setOrderLoading(false)
      setActiveAgentId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="bg-card border-border flex-1">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Order Mode</p>
              <p className="text-xs text-muted-foreground">{autoOrderMode ? 'Full Auto - Orders placed automatically' : 'Human Approval - Review before sending'}</p>
            </div>
            <Switch checked={autoOrderMode} onCheckedChange={setAutoOrderMode} />
          </CardContent>
        </Card>
        <Card className="bg-card border-border flex-1">
          <CardContent className="p-4">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Manager Email *</Label>
            <div className="flex items-center gap-2">
              <FiMail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Input
                type="email"
                placeholder="manager@clinic.com"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Result */}
      {orderResult && (
        <Card className="bg-green-900/20 border-green-700/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FiCheck className="w-5 h-5 text-green-400" />
              <h3 className="font-serif font-semibold text-green-400">Order Confirmed</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Reference:</span>{' '}
                <span className="text-foreground font-medium">{(orderResult?.order_reference as string) ?? 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Emails Sent:</span>{' '}
                <span className="text-foreground font-medium">{(orderResult?.total_emails_sent as number) ?? 0}</span>
              </div>
            </div>
            {Array.isArray(orderResult?.emails_sent) && (orderResult.emails_sent as Array<Record<string, unknown>>).map((email, i) => (
              <div key={i} className="bg-secondary/50 rounded-md p-2 text-xs">
                <span className="text-foreground">{(email?.subject as string) ?? ''}</span>
                <span className="text-muted-foreground ml-2">to {(email?.recipient as string) ?? ''}</span>
                <span className={`ml-2 ${(email?.status as string) === 'sent' ? 'text-green-400' : 'text-yellow-400'}`}>{(email?.status as string) ?? ''}</span>
              </div>
            ))}
            {typeof orderResult?.message === 'string' && orderResult.message && (
              <div className="text-sm text-muted-foreground">{renderMarkdown(orderResult.message as string)}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <FiShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-serif font-semibold text-foreground mb-2">No Order Recommendations</h3>
            <p className="text-sm text-muted-foreground">Go to Dashboard and click &quot;Analyze &amp; Recommend Orders&quot; to generate recommendations based on current inventory levels.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-semibold text-foreground">{recommendations.length} Items Recommended</h3>
            <span className="text-sm text-muted-foreground">Est. Total: <span className="text-foreground font-bold">${totalCost.toFixed(2)}</span></span>
          </div>
          {recommendations.map((rec, idx) => {
            const priConfig = priorityConfig[rec.priority] ?? priorityConfig['medium']
            const breakdown = Array.isArray(rec.breakdown_by_clinic) ? rec.breakdown_by_clinic : []
            const isExpanded = expandedItems.has(idx)
            return (
              <Card key={idx} className={`bg-card border-border ${!rec.approved ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground">{rec.item_name}</h4>
                        <Badge variant="outline" className="text-xs text-muted-foreground border-border">{rec.sku}</Badge>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${priConfig.cls}`}>{priConfig.label}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span>Qty: <span className="text-foreground font-medium">{rec.edited_quantity}</span></span>
                        <span>Unit Cost: ${rec.estimated_unit_cost.toFixed(2)}</span>
                        <span>Subtotal: <span className="text-foreground font-medium">${(rec.edited_quantity * rec.estimated_unit_cost).toFixed(2)}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => toggleExpand(idx)} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                        {isExpanded ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleApproval(idx)} className={`h-8 w-8 p-0 ${rec.approved ? 'text-green-400 hover:text-green-300' : 'text-muted-foreground hover:text-foreground'}`}>
                        <FiCheck className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0">
                        <FiX className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Edit Quantity</Label>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => updateQuantity(idx, rec.edited_quantity - 1)} className="border-border w-8 h-8 p-0"><FiMinus className="w-3 h-3" /></Button>
                          <Input type="number" value={rec.edited_quantity} onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)} className="bg-input border-border text-foreground w-20 text-center h-8" />
                          <Button variant="outline" size="sm" onClick={() => updateQuantity(idx, rec.edited_quantity + 1)} className="border-border w-8 h-8 p-0"><FiPlus className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      {breakdown.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Breakdown by Clinic:</p>
                          <div className="space-y-1">
                            {breakdown.map((b, bi) => (
                              <div key={bi} className="flex items-center justify-between text-xs bg-secondary/50 rounded px-2 py-1">
                                <span className="text-foreground">{b?.clinic_name ?? 'Unknown'}</span>
                                <span className="text-muted-foreground">{b?.quantity ?? 0} units</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rec.justification && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Justification:</p>
                          <p className="text-xs text-foreground/80">{rec.justification}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Bottom Action Bar */}
      {recommendations.length > 0 && (
        <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border p-4 -mx-6 -mb-6 flex items-center justify-between gap-4">
          <Button variant="outline" onClick={() => setRecommendations([])} className="border-border text-muted-foreground hover:text-foreground">
            Dismiss All
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{approvedItems.length} of {recommendations.length} approved</span>
            <Button
              onClick={handleApproveAndSend}
              disabled={orderLoading || approvedItems.length === 0 || !managerEmail.trim()}
              className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)] px-6"
            >
              {orderLoading ? (
                <><FiLoader className="w-4 h-4 mr-2 animate-spin" />Sending...</>
              ) : (
                <><FiSend className="w-4 h-4 mr-2" />Approve &amp; Send Order</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inventory List Screen ───────────────────────────────────
function InventoryListScreen({ inventory }: { inventory: InventoryItem[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [clinicFilter, setClinicFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField] = useState<string>('product_name')
  const [sortAsc, setSortAsc] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 8

  const clinicNames = useMemo(() => {
    const names = new Set(inventory.map(i => i.clinic_name))
    return Array.from(names).sort()
  }, [inventory])

  const filtered = useMemo(() => {
    let items = [...inventory]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(i => i.product_name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
    }
    if (clinicFilter !== 'all') {
      items = items.filter(i => i.clinic_name === clinicFilter)
    }
    if (statusFilter !== 'all') {
      items = items.filter(i => i.status === statusFilter)
    }
    items.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''
      if (sortField === 'product_name') { valA = a.product_name; valB = b.product_name }
      else if (sortField === 'clinic_name') { valA = a.clinic_name; valB = b.clinic_name }
      else if (sortField === 'current_count') { valA = a.current_count; valB = b.current_count }
      else if (sortField === 'status') { valA = a.status; valB = b.status }
      else if (sortField === 'last_updated') { valA = a.last_updated; valB = b.last_updated }
      if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA)
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
    return items
  }, [inventory, searchQuery, clinicFilter, statusFilter, sortField, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortAsc ? <FiChevronUp className="w-3 h-3 inline ml-1" /> : <FiChevronDown className="w-3 h-3 inline ml-1" />
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or SKU..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="bg-input border-border text-foreground pl-9"
              />
            </div>
            <Select value={clinicFilter} onValueChange={(v) => { setClinicFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-52">
                <SelectValue placeholder="All Clinics" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Clinics</SelectItem>
                {clinicNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="bg-input border-border text-foreground w-full sm:w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="green">Stocked</SelectItem>
                <SelectItem value="yellow">Low</SelectItem>
                <SelectItem value="red">Order Needed</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => handleSort('product_name')}>Product Name <SortIcon field="product_name" /></TableHead>
                <TableHead className="text-muted-foreground">SKU</TableHead>
                <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => handleSort('clinic_name')}>Clinic <SortIcon field="clinic_name" /></TableHead>
                <TableHead className="text-muted-foreground cursor-pointer select-none text-center" onClick={() => handleSort('current_count')}>Count <SortIcon field="current_count" /></TableHead>
                <TableHead className="text-muted-foreground text-center">Min</TableHead>
                <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => handleSort('status')}>Status <SortIcon field="status" /></TableHead>
                <TableHead className="text-muted-foreground cursor-pointer select-none" onClick={() => handleSort('last_updated')}>Updated <SortIcon field="last_updated" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No items match your filters.</TableCell>
                </TableRow>
              ) : (
                paged.map(item => (
                  <TableRow key={item.id} className="border-border hover:bg-secondary/30">
                    <TableCell className="text-foreground font-medium text-sm">{item.product_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.sku}</TableCell>
                    <TableCell className="text-foreground text-sm">{item.clinic_name}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold text-sm ${item.current_count <= item.min_threshold ? 'text-red-400' : 'text-foreground'}`}>{item.current_count}</span>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm">{item.min_threshold}</TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(item.last_updated)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">{filtered.length} items total</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)} className="border-border text-foreground h-8">Prev</Button>
            <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)} className="border-border text-foreground h-8">Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Settings Screen ─────────────────────────────────────────
function SettingsScreen({
  clinics, setClinics, products, setProducts,
  managerEmail, setManagerEmail
}: {
  clinics: Clinic[]
  setClinics: (c: Clinic[]) => void
  products: Product[]
  setProducts: (p: Product[]) => void
  managerEmail: string
  setManagerEmail: (e: string) => void
}) {
  const [editClinicDialog, setEditClinicDialog] = useState<Clinic | null>(null)
  const [editProductDialog, setEditProductDialog] = useState<Product | null>(null)
  const [newClinic, setNewClinic] = useState<Partial<Clinic>>({})
  const [newProduct, setNewProduct] = useState<Partial<Product>>({})
  const [alertFrequency, setAlertFrequency] = useState('daily')
  const [confidenceThreshold, setConfidenceThreshold] = useState([75])
  const [preferredSupplier, setPreferredSupplier] = useState('')
  const [showAddClinic, setShowAddClinic] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)

  const handleAddClinic = () => {
    if (!newClinic.name?.trim()) return
    const c: Clinic = {
      id: `clinic-${Date.now()}`,
      name: newClinic.name || '',
      address: newClinic.address || '',
      state: newClinic.state || '',
      lat: newClinic.lat || 0,
      lng: newClinic.lng || 0,
    }
    setClinics([...clinics, c])
    setNewClinic({})
    setShowAddClinic(false)
  }

  const handleAddProduct = () => {
    if (!newProduct.name?.trim()) return
    const p: Product = {
      id: `prod-${Date.now()}`,
      name: newProduct.name || '',
      sku: newProduct.sku || '',
      min_threshold: newProduct.min_threshold || 5,
      max_threshold: newProduct.max_threshold || 50,
    }
    setProducts([...products, p])
    setNewProduct({})
    setShowAddProduct(false)
  }

  const handleSaveClinic = () => {
    if (!editClinicDialog) return
    setClinics(clinics.map(c => c.id === editClinicDialog.id ? editClinicDialog : c))
    setEditClinicDialog(null)
  }

  const handleSaveProduct = () => {
    if (!editProductDialog) return
    setProducts(products.map(p => p.id === editProductDialog.id ? editProductDialog : p))
    setEditProductDialog(null)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Tabs defaultValue="clinics">
        <TabsList className="bg-secondary border border-border w-full justify-start mb-6">
          <TabsTrigger value="clinics" className="data-[state=active]:bg-[hsl(36,60%,31%)]/20 data-[state=active]:text-[hsl(36,60%,50%)]">Clinic Locations</TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-[hsl(36,60%,31%)]/20 data-[state=active]:text-[hsl(36,60%,50%)]">Product Catalog</TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-[hsl(36,60%,31%)]/20 data-[state=active]:text-[hsl(36,60%,50%)]">Notifications</TabsTrigger>
          <TabsTrigger value="autoorder" className="data-[state=active]:bg-[hsl(36,60%,31%)]/20 data-[state=active]:text-[hsl(36,60%,50%)]">Auto-Order Rules</TabsTrigger>
        </TabsList>

        {/* Clinic Locations */}
        <TabsContent value="clinics" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-semibold text-foreground">Clinics ({clinics.length})</h3>
            <Button size="sm" onClick={() => setShowAddClinic(!showAddClinic)} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">
              <FiPlus className="w-4 h-4 mr-1" />Add Clinic
            </Button>
          </div>
          {showAddClinic && (
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name *</Label>
                    <Input value={newClinic.name ?? ''} onChange={(e) => setNewClinic(prev => ({ ...prev, name: e.target.value }))} className="bg-input border-border text-foreground mt-1" placeholder="Clinic name" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">State</Label>
                    <Input value={newClinic.state ?? ''} onChange={(e) => setNewClinic(prev => ({ ...prev, state: e.target.value }))} className="bg-input border-border text-foreground mt-1" placeholder="AZ" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input value={newClinic.address ?? ''} onChange={(e) => setNewClinic(prev => ({ ...prev, address: e.target.value }))} className="bg-input border-border text-foreground mt-1" placeholder="Full address" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowAddClinic(false); setNewClinic({}) }} className="border-border">Cancel</Button>
                  <Button size="sm" onClick={handleAddClinic} disabled={!newClinic.name?.trim()} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">Save</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {clinics.map(clinic => (
            <Card key={clinic.id} className="bg-card border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{clinic.name}</p>
                  <p className="text-xs text-muted-foreground">{clinic.address}</p>
                  <Badge variant="outline" className="text-[10px] mt-1 border-border text-muted-foreground">{clinic.state}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditClinicDialog({ ...clinic })} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                    <FiEdit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setClinics(clinics.filter(c => c.id !== clinic.id))} className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0">
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Product Catalog */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-semibold text-foreground">Products ({products.length})</h3>
            <Button size="sm" onClick={() => setShowAddProduct(!showAddProduct)} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">
              <FiPlus className="w-4 h-4 mr-1" />Add Product
            </Button>
          </div>
          {showAddProduct && (
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Product Name *</Label>
                    <Input value={newProduct.name ?? ''} onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className="bg-input border-border text-foreground mt-1" placeholder="Product name" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">SKU *</Label>
                    <Input value={newProduct.sku ?? ''} onChange={(e) => setNewProduct(prev => ({ ...prev, sku: e.target.value }))} className="bg-input border-border text-foreground mt-1" placeholder="SKU-001" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Threshold</Label>
                    <Input type="number" value={newProduct.min_threshold ?? 5} onChange={(e) => setNewProduct(prev => ({ ...prev, min_threshold: parseInt(e.target.value) || 0 }))} className="bg-input border-border text-foreground mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Threshold</Label>
                    <Input type="number" value={newProduct.max_threshold ?? 50} onChange={(e) => setNewProduct(prev => ({ ...prev, max_threshold: parseInt(e.target.value) || 0 }))} className="bg-input border-border text-foreground mt-1" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowAddProduct(false); setNewProduct({}) }} className="border-border">Cancel</Button>
                  <Button size="sm" onClick={handleAddProduct} disabled={!newProduct.name?.trim()} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">Save</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {products.map(product => (
            <Card key={product.id} className="bg-card border-border">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>SKU: {product.sku}</span>
                    <span>Min: {product.min_threshold}</span>
                    <span>Max: {product.max_threshold}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditProductDialog({ ...product })} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                    <FiEdit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setProducts(products.filter(p => p.id !== product.id))} className="text-muted-foreground hover:text-red-400 h-8 w-8 p-0">
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div>
                <Label className="text-sm text-foreground font-medium">Manager Email</Label>
                <Input
                  type="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder="manager@clinic.com"
                  className="bg-input border-border text-foreground mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm text-foreground font-medium">Alert Frequency</Label>
                <Select value={alertFrequency} onValueChange={setAlertFrequency}>
                  <SelectTrigger className="bg-input border-border text-foreground mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="realtime">Real-time</SelectItem>
                    <SelectItem value="hourly">Hourly Digest</SelectItem>
                    <SelectItem value="daily">Daily Summary</SelectItem>
                    <SelectItem value="weekly">Weekly Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auto-Order Rules */}
        <TabsContent value="autoorder" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-6">
              <div>
                <Label className="text-sm text-foreground font-medium">Confidence Threshold</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Minimum confidence level required for auto-ordering: {confidenceThreshold[0]}%</p>
                <Slider
                  value={confidenceThreshold}
                  onValueChange={setConfidenceThreshold}
                  min={50}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
              <Separator />
              <div>
                <Label className="text-sm text-foreground font-medium">Preferred Supplier</Label>
                <Input
                  value={preferredSupplier}
                  onChange={(e) => setPreferredSupplier(e.target.value)}
                  placeholder="e.g. MedSupply Inc."
                  className="bg-input border-border text-foreground mt-1.5"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Clinic Dialog */}
      <Dialog open={!!editClinicDialog} onOpenChange={(open) => { if (!open) setEditClinicDialog(null) }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-foreground">Edit Clinic</DialogTitle>
          </DialogHeader>
          {editClinicDialog && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={editClinicDialog.name} onChange={(e) => setEditClinicDialog({ ...editClinicDialog, name: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input value={editClinicDialog.address} onChange={(e) => setEditClinicDialog({ ...editClinicDialog, address: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input value={editClinicDialog.state} onChange={(e) => setEditClinicDialog({ ...editClinicDialog, state: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClinicDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveClinic} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editProductDialog} onOpenChange={(open) => { if (!open) setEditProductDialog(null) }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-serif text-foreground">Edit Product</DialogTitle>
          </DialogHeader>
          {editProductDialog && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Product Name</Label>
                <Input value={editProductDialog.name} onChange={(e) => setEditProductDialog({ ...editProductDialog, name: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <Input value={editProductDialog.sku} onChange={(e) => setEditProductDialog({ ...editProductDialog, sku: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Min Threshold</Label>
                  <Input type="number" value={editProductDialog.min_threshold} onChange={(e) => setEditProductDialog({ ...editProductDialog, min_threshold: parseInt(e.target.value) || 0 })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Threshold</Label>
                  <Input type="number" value={editProductDialog.max_threshold} onChange={(e) => setEditProductDialog({ ...editProductDialog, max_threshold: parseInt(e.target.value) || 0 })} className="bg-input border-border text-foreground mt-1" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProductDialog(null)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveProduct} className="bg-[hsl(36,60%,31%)] hover:bg-[hsl(36,60%,36%)] text-[hsl(35,20%,95%)]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Agent Info Panel ────────────────────────────────────────
function AgentInfoPanel({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: INVENTORY_AGENT_ID, name: 'Inventory Update Agent', purpose: 'Validates and records scanned inventory counts' },
    { id: ORDER_AGENT_ID, name: 'Order Intelligence Agent', purpose: 'Analyzes stock levels, generates order recommendations' },
    { id: NOTIFICATION_AGENT_ID, name: 'Notification & Order Agent', purpose: 'Sends order confirmations and alerts via email' },
  ]

  return (
    <Card className="bg-card border-border mt-6">
      <CardContent className="p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Powering This App</h4>
        <div className="space-y-2">
          {agents.map(agent => {
            const isActive = activeAgentId === agent.id
            return (
              <div key={agent.id} className={`flex items-center gap-3 p-2 rounded-lg text-xs transition-colors ${isActive ? 'bg-[hsl(36,60%,31%)]/15 border border-[hsl(36,60%,31%)]/30' : ''}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-[hsl(36,60%,50%)] animate-pulse' : 'bg-muted-foreground/30'}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${isActive ? 'text-[hsl(36,60%,50%)]' : 'text-foreground'}`}>{agent.name}</span>
                  <p className="text-muted-foreground truncate">{agent.purpose}</p>
                </div>
                {isActive && <FiLoader className="w-3 h-3 animate-spin text-[hsl(36,60%,50%)] flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function Page() {
  const mounted = useMounted()

  // Navigation
  const [activeScreen, setActiveScreen] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Core data
  const [inventory, setInventory] = useState<InventoryItem[]>(SAMPLE_INVENTORY)
  const [clinics, setClinics] = useState<Clinic[]>(SAMPLE_CLINICS)
  const [products, setProducts] = useState<Product[]>(SAMPLE_PRODUCTS)

  // Scan
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([])
  const [scanLoading, setScanLoading] = useState(false)

  // Orders
  const [recommendations, setRecommendations] = useState<OrderRecommendation[]>([])
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)
  const [autoOrderMode, setAutoOrderMode] = useState(false)
  const [managerEmail, setManagerEmail] = useState('')

  // UI
  const [selectedClinic, setSelectedClinic] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const notificationCount = inventory.filter(i => i.status === 'critical' || i.status === 'red').length

  // Prevent hydration mismatch by rendering a loading shell until client mounts
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-[hsl(36,60%,31%)] flex items-center justify-center mx-auto mb-3">
            <FiCrosshair className="w-5 h-5 text-[hsl(35,20%,95%)]" />
          </div>
          <p className="text-sm text-muted-foreground font-serif">Loading XTrackedOS...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <Sidebar
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          <HeaderBar activeScreen={activeScreen} notificationCount={notificationCount} />

          <ScrollArea className="flex-1">
            <div className="p-6">
              {/* Status Banner */}
              {statusMessage && <StatusBanner message={statusMessage} onClose={() => setStatusMessage(null)} />}

              {/* Screens */}
              {activeScreen === 'dashboard' && (
                <DashboardScreen
                  inventory={inventory}
                  clinics={clinics}
                  products={products}
                  analysisLoading={analysisLoading}
                  setAnalysisLoading={setAnalysisLoading}
                  setRecommendations={setRecommendations}
                  setActiveScreen={setActiveScreen}
                  setStatusMessage={setStatusMessage}
                  activeAgentId={activeAgentId}
                  setActiveAgentId={setActiveAgentId}
                  selectedClinic={selectedClinic}
                  setSelectedClinic={setSelectedClinic}
                />
              )}

              {activeScreen === 'scan' && (
                <ScanScreen
                  inventory={inventory}
                  setInventory={setInventory}
                  clinics={clinics}
                  products={products}
                  recentScans={recentScans}
                  setRecentScans={setRecentScans}
                  scanLoading={scanLoading}
                  setScanLoading={setScanLoading}
                  setStatusMessage={setStatusMessage}
                  setActiveAgentId={setActiveAgentId}
                />
              )}

              {activeScreen === 'orders' && (
                <OrderReviewScreen
                  recommendations={recommendations}
                  setRecommendations={setRecommendations}
                  orderLoading={orderLoading}
                  setOrderLoading={setOrderLoading}
                  autoOrderMode={autoOrderMode}
                  setAutoOrderMode={setAutoOrderMode}
                  managerEmail={managerEmail}
                  setManagerEmail={setManagerEmail}
                  setStatusMessage={setStatusMessage}
                  setActiveAgentId={setActiveAgentId}
                />
              )}

              {activeScreen === 'inventory' && (
                <InventoryListScreen inventory={inventory} />
              )}

              {activeScreen === 'settings' && (
                <SettingsScreen
                  clinics={clinics}
                  setClinics={setClinics}
                  products={products}
                  setProducts={setProducts}
                  managerEmail={managerEmail}
                  setManagerEmail={setManagerEmail}
                />
              )}

              {/* Agent Info */}
              <AgentInfoPanel activeAgentId={activeAgentId} />
            </div>
          </ScrollArea>
        </div>
      </div>
    </ErrorBoundary>
  )
}
