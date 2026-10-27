import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { ChevronDown, ChevronUp, Map, Search, TrainFront, X } from 'lucide-react'
import { Button } from './components/ui/button'

export type SheetState = 'peek' | 'browse' | 'expanded' | 'hidden'

export function useSheetViewport() {
  const read = () => ({
    mobile: window.matchMedia('(max-width: 767px)').matches,
    height: window.innerHeight,
    safeBottom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0,
  })
  const [viewport, setViewport] = useState(read)
  useEffect(() => {
    const update = () => setViewport(read())
    window.addEventListener('resize', update)
    const media = window.matchMedia('(max-width: 767px)')
    media.addEventListener('change', update)
    return () => { window.removeEventListener('resize', update); media.removeEventListener('change', update) }
  }, [])
  return viewport
}

export function sheetHeight(state: SheetState, height: number, safeBottom = 0) {
  if (state === 'hidden') return 76 + safeBottom
  if (state === 'peek') return 80 + safeBottom
  if (state === 'expanded') return height - 76
  return Math.max(280, Math.round(height * .46))
}

type Props = {
  children: ReactNode
  state: SheetState
  onStateChange: Dispatch<SetStateAction<SheetState>>
  viewport: ReturnType<typeof useSheetViewport>
  title: string
  subtitle: string
  line?: string
  color: string
  compactNavigation?: ReactNode
}

// One mounted explorer: a persistent sidebar on desktop, a nonmodal sheet on phones.
export default function ExplorerPanel({ children, state, onStateChange, viewport, title, subtitle, line, color, compactNavigation }: Props) {
  const reopen=useRef<HTMLButtonElement>(null)
  if (!viewport.mobile) return <aside className="sidebar" aria-label="Linien und Lernwege">{children}</aside>

  const points = ['peek', 'browse', 'expanded'].map(s => `${sheetHeight(s as SheetState, viewport.height, viewport.safeBottom)}px`)
  const index = Math.max(0, ['peek', 'browse', 'expanded'].indexOf(state))
  const style = {
    '--route-color': color,
    '--sheet-size': `${sheetHeight(state, viewport.height, viewport.safeBottom)}px`,
    '--sheet-header-size': `${80 + (state === 'peek' ? viewport.safeBottom : 0)}px`,
  } as CSSProperties

  return <Drawer.Root open={state !== 'hidden'} onOpenChange={open => onStateChange(open ? 'browse' : 'hidden')}
    modal={false} disablePointerDismissal snapToSequentialPoints snapPoints={points} snapPoint={points[index]}
    onSnapPointChange={point => { const i = points.indexOf(String(point)); if (i >= 0) onStateChange(current => current === 'hidden' ? current : (['peek', 'browse', 'expanded'] as const)[i]) }}>
    <Drawer.VirtualKeyboardProvider>
    {state === 'hidden' && <Drawer.Trigger render={<button ref={reopen}/>} className="sheet-reopen" aria-label="Linien und Suche öffnen">
        {line ? <span className="reopen-line" style={{ background: color }}>{line}</span> : <Search size={18}/>}
        <span>{line ? title : 'Linien & Suche'}<small>{line ? 'Details öffnen' : 'Zürich entdecken'}</small></span>
        <ChevronUp size={17}/>
    </Drawer.Trigger>}
    <Drawer.Portal>
      <Drawer.Viewport className="sheet-viewport">
      <Drawer.Popup className="sidebar mobile-sheet" style={style} data-sheet-state={state} data-testid="explorer-sheet"
        initialFocus={false} finalFocus={reopen} aria-describedby="sheet-description">
        <div className="sheet-grip" data-testid="sheet-grip" aria-hidden="true"/>
        <div className="sheet-summary" data-base-ui-swipe-ignore>
          <button className="sheet-summary-main" onClick={() => onStateChange(state === 'peek' ? 'browse' : 'peek')}
            aria-label={state === 'peek' ? 'Details öffnen' : 'Panel kompakt anzeigen'} aria-expanded={state !== 'peek'}>
            <span className={'sheet-summary-icon ' + (line ? 'has-line' : '')} style={line ? { background: color } : undefined}>{line ?? <TrainFront size={20}/>}</span>
            <span className="sheet-summary-text"><Drawer.Title>{title}</Drawer.Title><span>{subtitle}</span></span>
          </button>
          {state === 'peek' && compactNavigation}
          <Button className="sheet-expand" variant="ghost" size="icon" aria-label={state === 'expanded' ? 'Details verkleinern' : 'Details erweitern'}
            onClick={() => onStateChange(state === 'expanded' ? 'browse' : 'expanded')}>{state === 'expanded' ? <ChevronDown/> : <ChevronUp/>}</Button>
          <Drawer.Close render={<Button variant="ghost" size="icon"/>} aria-label="Panel ausblenden"><X/></Drawer.Close>
        </div>
        <Drawer.Description className="sr-only" id="sheet-description">Linien, Orte und Lernwege. Ziehe den Griff für mehr Details oder blende das Panel für die ganze Karte aus.</Drawer.Description>
        <Drawer.Content className="sheet-body" inert={state === 'peek'} aria-hidden={state === 'peek'}>{children}</Drawer.Content>
        {state !== 'peek' && <button className="sheet-map-action" data-base-ui-swipe-ignore onClick={() => onStateChange('peek')}><Map size={15}/> Mehr Karte anzeigen <ChevronDown size={15}/></button>}
      </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
    </Drawer.VirtualKeyboardProvider>
  </Drawer.Root>
}
