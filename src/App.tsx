import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, Eye, Info, MapPin, RefreshCw, Search, Share2, TrainFront, WifiOff, X } from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog'
import MapView from './MapView'
import ExplorerPanel, { sheetHeight, useSheetViewport, type SheetState } from './ExplorerPanel'
import { normalize, readSelection, selectionQuery, type Catalog, type MapData, type Selection, type Stop } from './types'

const memoryKey='tram-atlas-selection'
function stored(){try{return localStorage.getItem(memoryKey)??''}catch{return ''}}
function remember(q:string){try{localStorage.setItem(memoryKey,q)}catch{/* The map remains usable without persistence. */}}
type Loaded = { catalog: Catalog; mapData: MapData }

export default function App(){
  const [loaded,setLoaded]=useState<Loaded|null>(null)
  const [error,setError]=useState(false)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();setError(false)
    const load=async()=>{
      const responses=await Promise.all(['catalog.json','network.geojson','stops.geojson','context.geojson'].map(f=>fetch(import.meta.env.BASE_URL+'data/'+f,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Missing data');return r.json()})))
      if(!responses[0].routes?.length||!responses[0].stops?.length||responses.slice(1).some(d=>d.type!=='FeatureCollection'))throw Error('Invalid data')
      setLoaded({catalog:responses[0],mapData:{network:responses[1],stops:responses[2],context:responses[3]}})
    }
    load().catch(e=>{if(e.name!=='AbortError')setError(true)})
    return ()=>controller.abort()
  },[attempt])
  if(!loaded)return <main className="boot"><div className="brand-mark"><TrainFront size={27}/></div><h1>Tram Atlas</h1>{error?<><p role="alert">Die Kartendaten konnten nicht geladen werden. Prüfe deine Verbindung. Für die erste Nutzung brauchst du Internet.</p><Button onClick={()=>setAttempt(v=>v+1)}><RefreshCw/>Erneut versuchen</Button></>:<p role="status">Ein neuer Blick auf Zürich …</p>}</main>
  return <Atlas {...loaded}/>
}

function Atlas({catalog,mapData}:Loaded){
  const [selection,setSelection]=useState<Selection>(()=>readSelection(catalog,location.search||stored())??{kind:'overview'})
  const [notice,setNotice]=useState(()=>location.search&&!readSelection(catalog,location.search)?'Diese Auswahl gibt es nicht mehr. Das Netz ist weiterhin verfügbar.':'')
  const [tab,setTab]=useState<'lines'|'exercises'>(()=>selection.kind==='exercise'?'exercises':'lines')
  const [focusedStop,setFocusedStop]=useState<string|null>(null)
  const [hideLabels,setHideLabels]=useState(false)
  const [sheetState,setSheetState]=useState<SheetState>('browse')
  const viewport=useSheetViewport()
  const mapInset=viewport.mobile?sheetHeight(sheetState,viewport.height,viewport.safeBottom):0
  const [query,setQuery]=useState('')
  const [searching,setSearching]=useState(false)
  const [searchIndex,setSearchIndex]=useState(0)
  const [info,setInfo]=useState(false)
  const [share,setShare]=useState(false)
  const [copied,setCopied]=useState(false)
  const [online,setOnline]=useState(navigator.onLine)
  const [offlineReady,setOfflineReady]=useState(false)
  const [updateAvailable,setUpdateAvailable]=useState(false)
  const updater=useRef<((reload?:boolean)=>Promise<void>)|null>(null)
  const input=useRef<HTMLInputElement>(null)
  const stopsById=useMemo(()=>new Map([...catalog.stops,...catalog.streets].map(s=>[s.id,s])),[catalog])
  const lines=useMemo(()=>catalog.routes.filter(r=>r.direction===1).sort((a,b)=>Number(a.line)-Number(b.line)),[catalog])
  const route=selection.kind==='line'?catalog.routes.find(r=>r.line===selection.line&&r.direction===selection.direction):undefined
  const place=selection.kind==='place'?stopsById.get(selection.id):undefined
  const exercise=selection.kind==='exercise'?catalog.exercises.find(e=>e.id===selection.id):undefined
  const ids=route?.stopIds??exercise?.stopIds??[]
  const currentIndex=focusedStop?ids.indexOf(focusedStop):-1
  const results=useMemo(()=>{
    let q=normalize(query).replace('hauptbahnhof','hb');if(!q)return []
    return [...catalog.stops,...catalog.streets].filter(s=>normalize(s.name).includes(q)).sort((a,b)=>Number(normalize(b.name).startsWith(q))-Number(normalize(a.name).startsWith(q))||Number(b.major)-Number(a.major)).slice(0,7)
  },[query,catalog])

  useEffect(()=>{
    const q=selectionQuery(selection);remember(q)
    if(location.search!==q)history.replaceState({},'',location.pathname+q)
  },[selection])

  useEffect(()=>{
    const onPop=()=>{const s=readSelection(catalog,location.search);setSelection(s??{kind:'overview'});setTab(s?.kind==='exercise'?'exercises':'lines');setFocusedStop(null);setSearching(false);setSheetState('browse')}
    window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)
  },[catalog])

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();input.current?.focus()}if(e.key==='Escape'){setSearching(false);input.current?.blur()}}
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)
  },[])

  useEffect(()=>{
    const yes=()=>setOnline(true),no=()=>setOnline(false)
    window.addEventListener('online',yes);window.addEventListener('offline',no)
    if('serviceWorker' in navigator&&import.meta.env.PROD){
      updater.current=registerSW({immediate:true,onOfflineReady:()=>setOfflineReady(true),onNeedRefresh:()=>setUpdateAvailable(true),onRegisteredSW:(_url,registration)=>{
        if(registration?.active&&navigator.serviceWorker.controller)setOfflineReady(true)
      },onRegisterError:()=>setOfflineReady(false)})
    }
    return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}
  },[])

  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer)},[notice])
  useEffect(()=>{if(!focusedStop)return;document.querySelector(`[data-stop-id="${focusedStop}"]`)?.scrollIntoView({block:'nearest',behavior:'instant'})},[focusedStop])

  function choose(next:Selection, reveal:SheetState='browse'){
    const q=selectionQuery(next)
    if(q!==location.search)history.pushState({},'',location.pathname+q)
    setSelection(next);setFocusedStop(null);setHideLabels(false);setSearching(false);setQuery('');setSheetState(reveal)
    if(next.kind==='line'||next.kind==='overview')setTab('lines')
    if(next.kind==='exercise')setTab('exercises')
  }
  function chooseLine(line:string){choose({kind:'line',line,direction:1})}
  function chooseStop(id:string){
    if(ids.includes(id)){setFocusedStop(id);return}
    choose({kind:'place',id},sheetState==='hidden'||sheetState==='peek'?'peek':'browse')
  }
  function focusStop(id:string){setFocusedStop(id);if(viewport.mobile&&sheetState==='expanded')setSheetState('peek')}
  function step(delta:number){const next=currentIndex<0?0:Math.max(0,Math.min(ids.length-1,currentIndex+delta));focusStop(ids[next])}
  async function copy(){try{await navigator.clipboard.writeText(location.href);setCopied(true)}catch{setNotice('Du kannst den Link im Feld markieren und kopieren.')}}
  const styleColor={'--route-color':route?.color??'#174d3d','--sheet-inset':`${mapInset}px`} as CSSProperties
  const sheetTitle=focusedStop?stopsById.get(focusedStop)?.name??'Zürich entdecken':route?.destination??place?.name??exercise?.title??'Zürich entdecken'
  const sheetSubtitle=route?`Tram ${route.line} · ${route.stopIds.length} Haltestellen`:exercise?'Lernweg · ungeprüftes Beispiel':place?.kind==='street'?'Strasse · Zürich':place?'Haltestelle · Zürich':`${lines.length} Linien · ${catalog.stops.length} Haltestellen`

  return <div className={`atlas sheet-${sheetState}`} style={styleColor}>
    <header className="app-header">
      <button className="brand" aria-label="Tram Atlas Startseite" onClick={()=>choose({kind:'overview'})}><span className="brand-mark"><TrainFront size={23} strokeWidth={1.7}/></span><span><strong>TRAM ATLAS<span className="brand-dot">.</span></strong><small>ZÜRICH ENTDECKEN</small></span></button>
      <div className="header-center"><span className="status-dot"/> Eine Stadt. Viele Verbindungen.</div>
      <div className="header-actions"><span className={'connection '+(!online?'is-offline':'')}>{!online?<WifiOff size={13}/>:offlineReady?<Check size={13}/>:<span className="tiny-dot"/>}<span>{!online?'Offline':offlineReady?'Offline bereit':'Lernkarte'}</span></span><Button variant="ghost" size="icon" onClick={()=>setInfo(true)} aria-label="Über die Karte"><Info size={19}/></Button></div>
    </header>
    <main className="workspace">
      <ExplorerPanel state={sheetState} onStateChange={setSheetState} viewport={viewport} title={sheetTitle} subtitle={sheetSubtitle} line={route?.line} color={route?.color??'#174d3d'}
        compactNavigation={ids.length>0?<><Button variant="ghost" size="icon" aria-label="Vorherige Haltestelle" disabled={currentIndex<=0} onClick={()=>step(-1)}><ChevronLeft/></Button><Button variant="ghost" size="icon" aria-label="Nächste Haltestelle" disabled={currentIndex===ids.length-1} onClick={()=>step(1)}><ChevronRight/></Button></>:undefined}>
        <div className="search-wrapper">
          <div className={'search-box '+(searching?'search-active':'')}><Search size={18}/><input ref={input} value={query} placeholder="Haltestelle oder Strasse …" aria-label="Haltestelle oder Strasse suchen" role="combobox" aria-expanded={searching&&!!query} aria-controls="place-results" aria-autocomplete="list" aria-activedescendant={searching&&results[searchIndex]?`result-${results[searchIndex].id}`:undefined}
            onFocus={()=>{setSearching(true);if(viewport.mobile)setSheetState('expanded')}} onChange={e=>{setQuery(e.target.value);setSearching(true);setSearchIndex(0)}}
            onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setSearchIndex(i=>Math.min(i+1,results.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setSearchIndex(i=>Math.max(i-1,0))}if(e.key==='Enter'&&results[searchIndex]){choose({kind:'place',id:results[searchIndex].id});input.current?.blur()}if(e.key==='Escape')setSearching(false)}}/>
            {query?<button className="search-clear" aria-label="Suche löschen" onClick={()=>{setQuery('');input.current?.focus()}}><X size={15}/></button>:<kbd>⌘ K</kbd>}
          </div>
          {searching&&query&&<div className="search-results" id="place-results" role="listbox" aria-label="Suchergebnisse">{results.length?results.map((s,i)=><button id={`result-${s.id}`} key={s.id} role="option" aria-selected={i===searchIndex} tabIndex={-1} onClick={()=>{choose({kind:'place',id:s.id});input.current?.blur()}}><MapPin size={16}/><span>{s.name}<small>{s.kind==='street'?'Strasse · Linien in der Umgebung':s.lines.map(l=>'Tram '+l).join(' · ')}</small></span><ArrowUpRight size={14}/></button>):<p role="status">Kein Ort gefunden. Versuche einen anderen Namen.</p>}</div>}
        </div>

        <div className="section-tabs" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];const next=buttons.find(b=>b!==e.target);next?.click();next?.focus()}}} role="tablist" aria-label="Entdecken"><button role="tab" id="tab-lines" tabIndex={tab==='lines'?0:-1} aria-selected={tab==='lines'} aria-controls="explore-panel" onClick={()=>{setTab('lines');if(selection.kind!=='overview')choose({kind:'overview'})}}><TrainFront size={15}/> Linien</button><button role="tab" id="tab-exercises" tabIndex={tab==='exercises'?0:-1} aria-selected={tab==='exercises'} aria-controls="explore-panel" onClick={()=>{setTab('exercises');setSheetState('browse')}}><BookOpen size={15}/> Lernwege <span className="tab-count">1</span></button></div>

        <div className="panel-scroll" id="explore-panel" role="tabpanel" aria-labelledby={tab==='lines'?'tab-lines':'tab-exercises'}>
          {tab==='lines'&&selection.kind==='overview'&&<>
            <div className="intro"><span className="eyebrow">DEIN NETZGEFÜHL BEGINNT HIER</span><h1>Die Stadt verstehen.<br/><span>Linie für Linie.</span></h1><p>Entdecke Verbindungen, lerne Haltestellen und behalte das Netz im Kopf.</p></div>
            <div className="section-label"><span>WÄHLE EINE LINIE</span><span>{lines.length} Linien</span></div>
            <div className="line-grid">{lines.map(r=><button key={r.line} className="line-chip" style={{'--line':r.color} as CSSProperties} aria-label={`Linie ${r.line}`} onClick={()=>chooseLine(r.line)}><span>{r.line}</span></button>)}</div>
            <div className="gentle-note"><span className="note-icon"><MapPin size={18}/></span><p><strong>Ein neuer Blick auf Zürich.</strong><br/>Tippe auf eine Linie oder einen Ort in der Karte.</p></div>
            <button className="feature-card" onClick={()=>{setTab('exercises');choose({kind:'exercise',id:catalog.exercises[0].id})}}><div><span className="eyebrow">ZUM AUSPROBIEREN</span><h2>Vom See zum Kunsthaus</h2><p>Ein Lernweg durch die Stadt.</p></div><ArrowUpRight size={23}/><span className="feature-path" aria-hidden="true"><i/><b/><i/><b/><i/></span></button>
          </>}

          {tab==='lines'&&route&&<>
            <div className="selection-top"><button className="back-link" onClick={()=>choose({kind:'overview'})}><ArrowLeft size={14}/> Alle Linien</button><Button variant="ghost" size="icon" aria-label="Linie teilen" onClick={()=>{setShare(true);setCopied(false)}}><Share2 size={16}/></Button></div>
            <div className="route-header"><span className="large-line">{route.line}</span><div><span className="eyebrow">LINIE ENTDECKEN</span><h1>{route.destination}</h1><p>Ab {route.origin}</p></div></div>
            <button className="direction-button" onClick={()=>{const other=catalog.routes.find(r=>r.line===route.line&&r.direction!==route.direction);if(other)choose({kind:'line',line:other.line,direction:other.direction})}}><ArrowDown size={15}/><span>Richtung wechseln</span><span className="direction-end">{route.origin}</span></button>
            <div className="study-toggle"><div><Eye size={15}/><label htmlFor="recall">Namen ausblenden</label></div><Switch id="recall" checked={hideLabels} onCheckedChange={setHideLabels}/></div>
            {hideLabels&&<p className="recall-hint">Wie heisst die nächste Haltestelle? Blende die Namen wieder ein, um nachzusehen.</p>}
            <StopList ids={ids} byId={stopsById} focused={focusedStop} hidden={hideLabels} onSelect={focusStop}/>
          </>}

          {tab==='lines'&&place&&<>
            <div className="selection-top"><button className="back-link" onClick={()=>choose({kind:'overview'})}><ArrowLeft size={14}/> Zum Netz</button><Button variant="ghost" size="icon" aria-label="Ort teilen" onClick={()=>{setShare(true);setCopied(false)}}><Share2 size={16}/></Button></div>
            <div className="place-detail"><span className="place-icon"><MapPin size={24}/></span><span className="eyebrow">{place.kind==='street'?'STRASSE':'HALTESTELLE'}</span><h1>{place.name}</h1><p>{place.kind==='street'?'Tramlinien in der Umgebung.':'Hier verbinden sich diese Linien.'}</p></div>
            <div className="place-lines">{place.lines.map(line=>{const r=lines.find(r=>r.line===line);return <button key={line} className="place-line" onClick={()=>chooseLine(line)}><span className="small-line" style={{background:r?.color}}>{line}</span><span>{r?.origin}<small>{r?.destination}</small></span><ChevronRight size={17}/></button>})}</div>
          </>}

          {tab==='exercises'&&!exercise&&<>
            <div className="intro"><span className="eyebrow">VERBINDUNGEN VERSTEHEN</span><h1>Ein Weg.<br/><span>Viele Aha-Momente.</span></h1><p>Folge einem Beispielweg und entdecke, wie die Stadt zusammenhängt.</p></div>
            <p className="review-note"><Info size={16}/> Noch keine betrieblich geprüften Umleitungen. Der folgende Weg dient zum Lernen.</p>
            {catalog.exercises.map(e=><button className="exercise-card" key={e.id} onClick={()=>choose({kind:'exercise',id:e.id})}><span className="exercise-tag">UNGEPRÜFTES BEISPIEL</span><h2>{e.title}</h2><p>{e.subtitle}</p><div><span>{e.stopIds.length} Orientierungspunkte</span><ArrowRight size={18}/></div></button>)}
          </>}

          {tab==='exercises'&&exercise&&<>
            <div className="selection-top"><button className="back-link" onClick={()=>{choose({kind:'overview'});setTab('exercises')}}><ArrowLeft size={14}/> Alle Lernwege</button><Button variant="ghost" size="icon" aria-label="Lernweg teilen" onClick={()=>{setShare(true);setCopied(false)}}><Share2 size={16}/></Button></div>
            <div className="exercise-heading"><span className="eyebrow">LERNWEG 01</span><h1>{exercise.title}</h1><p>{exercise.subtitle}</p></div>
            <p className="review-note"><Info size={16}/><span><strong>Ungeprüftes Beispiel</strong><br/>{exercise.note}</span></p>
            <StopList ids={ids} byId={stopsById} focused={focusedStop} hidden={false} onSelect={focusStop}/>
          </>}
        </div>

        {ids.length>0&&((tab==='lines'&&route)||(tab==='exercises'&&exercise))&&<div className="step-controls"><Button variant="outline" size="icon" aria-label="Vorherige Haltestelle" disabled={currentIndex<=0} onClick={()=>step(-1)}><ChevronLeft/></Button><div><span>{currentIndex<0?'SCHRITT FÜR SCHRITT':`${currentIndex+1} VON ${ids.length}`}</span><strong>{currentIndex<0?'Dem Verlauf folgen':hideLabels?`Haltestelle ${currentIndex+1}`:stopsById.get(ids[currentIndex])?.name}</strong></div><Button variant="outline" size="icon" aria-label="Nächste Haltestelle" disabled={currentIndex===ids.length-1} onClick={()=>step(1)}><ChevronRight/></Button></div>}
        <footer className="panel-footer"><span><span className="tiny-dot"/> Netzstand {catalog.metadata.sourceDate}</span><button onClick={()=>setInfo(true)}>Daten & Hinweise <ArrowUpRight size={12}/></button></footer>
      </ExplorerPanel>
      <MapView data={mapData} catalog={catalog} selection={selection} focusedStop={focusedStop} hideLabels={hideLabels} bottomInset={mapInset} onPlace={chooseStop} onLine={line=>choose({kind:'line',line,direction:1},sheetState==='hidden'||sheetState==='peek'?'peek':'browse')}/>
      <div className="map-key"><span><i className="key-route"/> Tramnetz</span><span><i className="key-stop"/> Haltestelle</span></div>
      {selection.kind!=='overview'&&<button className="clear-map" onClick={()=>choose({kind:'overview'})}><X size={15}/> Auswahl aufheben</button>}
    </main>
    {notice&&<div className="toast" role="status">{notice}<button aria-label="Hinweis schliessen" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    {updateAvailable&&<div className="update-banner" role="status">Eine neue Version ist bereit.<Button size="sm" onClick={()=>updater.current?.(true)}>Aktualisieren</Button><button aria-label="Später aktualisieren" onClick={()=>setUpdateAvailable(false)}><X size={16}/></button></div>}

    <Dialog open={info} onOpenChange={setInfo}><DialogContent className="info-dialog"><DialogHeader><DialogTitle>Eine Karte zum Verstehen.</DialogTitle><DialogDescription>Tram Atlas Zürich · Daten, Nutzung und Grenzen</DialogDescription></DialogHeader><div className="info-content"><p>Eine reduzierte Lernkarte mit {lines.length} Tramlinien und {catalog.stops.length} Haltestellen. Wähle eine Linie, wechsle die Richtung und folge den Haltestellen auf der Karte.</p><h3>Was du hier siehst</h3><p>Veröffentlichte Liniengeometrien und Haltestellen des Kantons Zürich, aus Daten von ZVV/VBZ. Quellenstand: <strong>{catalog.metadata.sourceDate}</strong>. Die Aktualität für den heutigen Betrieb ist nicht bestätigt.</p><ul>{catalog.metadata.notes.slice(1).map(n=><li key={n}>{n}</li>)}</ul><h3>Auf deinem Handy</h3><p>{offlineReady?'Die App und ihre Kartendaten sind für die Offline-Nutzung gespeichert.':'Öffne die App über HTTPS und lasse den ersten Download abschliessen. Erst „Offline bereit“ bestätigt die gespeicherten Kartendaten.'} Du kannst die App über das Browsermenü zum Startbildschirm hinzufügen. Der Browser kann gespeicherte Daten bei Platzmangel entfernen.</p><p>Letzte Auswahl bleibt auf diesem Gerät, sofern dein Browser lokalen Speicher erlaubt.</p><a href="https://data.stadt-zuerich.ch/dataset/ktzh_linien_des_oeffentlichen_verkehrs__ogd_" target="_blank" rel="noreferrer">Offizielle Routendaten <ArrowUpRight size={13}/></a><a href="https://maps.zh.ch/wfs/OGDZHWFS?service=WFS&request=GetCapabilities" target="_blank" rel="noreferrer">Geodaten Kanton Zürich · CC0 <ArrowUpRight size={13}/></a></div></DialogContent></Dialog>
    <Dialog open={share} onOpenChange={setShare}><DialogContent><DialogHeader><DialogTitle>Diese Ansicht teilen</DialogTitle><DialogDescription>Der Link öffnet dieselbe Linie, Haltestelle oder denselben Lernweg. Die andere Person braucht Zugriff auf diese Website.</DialogDescription></DialogHeader><input className="share-input" aria-label="Link zur Ansicht" readOnly value={location.href} onFocus={e=>e.target.select()}/><Button onClick={copy}>{copied?<Check size={16}/>:<Share2 size={16}/>} {copied?'Link kopiert':'Link kopieren'}</Button></DialogContent></Dialog>
  </div>
}

function StopList({ids,byId,focused,hidden,onSelect}:{ids:string[];byId:Map<string,Stop>;focused:string|null;hidden:boolean;onSelect:(id:string)=>void}){
  return <div className="stop-section"><div className="section-label"><span>DER VERLAUF</span><span>{ids.length} Haltestellen</span></div><ol className="stop-list" aria-label="Haltestellen im Verlauf">{ids.map((id,index)=>{const s=byId.get(id);if(!s)return null;return <li key={`${id}-${index}`}><button data-stop-id={id} className={focused===id?'stop-selected':''} onClick={()=>onSelect(id)} aria-label={hidden?`Haltestelle ${index+1} auf Karte zeigen`:`${s.name} auf Karte zeigen`} aria-current={focused===id?'step':undefined}><span className="stop-node"/><span>{hidden?`Haltestelle ${String(index+1).padStart(2,'0')}`:s.name}</span>{s.major&&!hidden&&<span className="interchange">●</span>}</button></li>})}</ol></div>
}
