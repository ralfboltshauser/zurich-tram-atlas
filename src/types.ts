import type { FeatureCollection } from 'geojson'

export type Stop = { id: string; name: string; coordinates: [number, number]; lines: string[]; major: boolean; kind?: 'street' }
export type Route = { id: string; line: string; direction: number; color: string; origin: string; destination: string; stopIds: string[] }
export type Exercise = { id: string; title: string; subtitle: string; status: 'unreviewed'; note: string; stopIds: string[]; geometry: FeatureCollection }
export type Catalog = { routes: Route[]; stops: Stop[]; streets: Stop[]; exercises: Exercise[]; metadata: { sourceDate: string; licence: string; source: string; downloadedAt: string; notes: string[] } }
export type MapData = { network: FeatureCollection; stops: FeatureCollection; context: FeatureCollection }
export type Selection = { kind: 'overview' } | { kind: 'line'; line: string; direction: number } | { kind: 'place'; id: string } | { kind: 'exercise'; id: string }

export function readSelection(catalog: Catalog, value: string): Selection | null {
  try {
    const p = new URLSearchParams(value)
    const line = p.get('linie'), direction = Number(p.get('richtung') ?? 1)
    if (line && catalog.routes.some(r => r.line === line && r.direction === direction)) return {kind:'line',line,direction}
    const place = p.get('ort')
    if (place && [...catalog.stops,...catalog.streets].some(s => s.id === place)) return {kind:'place',id:place}
    const id = p.get('lernweg')
    if (id && catalog.exercises.some(s => s.id === id)) return {kind:'exercise',id}
    return value && value !== '?' ? null : {kind:'overview'}
  } catch { return null }
}

export function selectionQuery(selection: Selection) {
  const p = new URLSearchParams()
  if (selection.kind === 'line') { p.set('linie',selection.line); p.set('richtung',String(selection.direction)) }
  if (selection.kind === 'place') p.set('ort',selection.id)
  if (selection.kind === 'exercise') p.set('lernweg',selection.id)
  return p.size ? '?' + p.toString() : ''
}

export function normalize(value: string) {
  return value.toLowerCase().replaceAll('ä','a').replaceAll('ö','o').replaceAll('ü','u').replaceAll('ß','ss').replace(/[^a-z0-9]/g,'')
}
