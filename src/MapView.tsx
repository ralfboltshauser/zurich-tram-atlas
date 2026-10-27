import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
maplibregl.setWorkerUrl(workerUrl)
import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl'
import type { FeatureCollection, Position } from 'geojson'
import { Plus, Minus, LocateFixed, ArrowUpRight } from 'lucide-react'
import { Button } from './components/ui/button'
import type { Catalog, MapData, Selection } from './types'

type Props = { data: MapData; catalog: Catalog; selection: Selection; focusedStop: string | null; hideLabels: boolean; panelExpanded: boolean; onPlace: (id: string) => void; onLine: (line: string) => void }
const empty: FeatureCollection = { type:'FeatureCollection',features:[] }

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMap | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const [ready,setReady] = useState(false)
  const [failed,setFailed] = useState(false)
  const [retry,setRetry] = useState(0)

  useEffect(() => {
    let instance: LibreMap
    setReady(false);setFailed(false)
    try {
      instance = new maplibregl.Map({
        container:container.current!, center:[8.535,47.384],zoom:12.7,minZoom:10.5,maxZoom:18,
        maxBounds:[[8.31,47.25],[8.75,47.55]],attributionControl:false,pitchWithRotate:false,dragRotate:false,
        touchPitch:false, style:{version:8,sources:{
          context:{type:'geojson',data:props.data.context},
          network:{type:'geojson',data:props.data.network},
          stops:{type:'geojson',data:props.data.stops},
          selected:{type:'geojson',data:empty},focused:{type:'geojson',data:empty},
        },layers:[
          {id:'background',type:'background',paint:{'background-color':'#f3f2eb'}},
          {id:'water',type:'fill',source:'context',filter:['==',['get','kind'],'water'],paint:{'fill-color':'#cfdfdc'}},
          {id:'river',type:'line',source:'context',filter:['==',['get','kind'],'river'],paint:{'line-color':'#c3d7d2','line-width':['interpolate',['linear'],['zoom'],11,3,15,15,18,32],'line-opacity':0.9}},
          {id:'streets',type:'line',source:'context',filter:['==',['get','kind'],'street'],paint:{'line-color':'#ddddd3','line-width':['interpolate',['linear'],['zoom'],11,0.35,14,1.8,17,8]}},
          {id:'street-labels',type:'symbol',source:'context',minzoom:14.4,filter:['==',['get','kind'],'street'],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Inter Variable'],'text-size':11,'text-max-angle':35,'symbol-spacing':230},paint:{'text-color':'#7a8177','text-halo-color':'#f3f2eb','text-halo-width':2}},
          {id:'network-casing',type:'line',source:'network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f9f8f4','line-width':['interpolate',['linear'],['zoom'],11,3,14,6,17,10]}},
          {id:'network',type:'line',source:'network',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-opacity':0.62,'line-width':['interpolate',['linear'],['zoom'],11,1.4,14,2.6,17,4.5]}},
          {id:'network-hit',type:'line',source:'network',paint:{'line-width':18,'line-opacity':0}},
          {id:'selection-halo',type:'line',source:'selected',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fdfdf8','line-width':10}},
          {id:'selection',type:'line',source:'selected',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#174d3d','line-width':5}},
          {id:'stop-dots',type:'circle',source:'stops',minzoom:12,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,2.3,15,4.5],'circle-color':'#fafaf5','circle-stroke-color':'#5b6d61','circle-stroke-width':1.3}},
          {id:'stop-hit',type:'circle',source:'stops',minzoom:12,paint:{'circle-radius':13,'circle-opacity':0}},
          {id:'major-labels',type:'symbol',source:'stops',filter:['==',['get','major'],1],layout:{'text-field':['get','name'],'text-font':['Inter Variable'],'text-size':12,'text-anchor':'top','text-offset':[0,0.8],'text-max-width':12,'text-padding':8},paint:{'text-color':'#2b4338','text-halo-color':'#f5f4ee','text-halo-width':2}},
          {id:'minor-labels',type:'symbol',source:'stops',minzoom:14.1,filter:['==',['get','major'],0],layout:{'text-field':['get','name'],'text-font':['Inter Variable'],'text-size':11,'text-anchor':'top','text-offset':[0,0.8],'text-padding':7},paint:{'text-color':'#59665b','text-halo-color':'#f5f4ee','text-halo-width':2}},
          {id:'focused-halo',type:'circle',source:'focused',paint:{'circle-radius':15,'circle-color':'#164e3d','circle-opacity':0.13}},
          {id:'focused-dot',type:'circle',source:'focused',paint:{'circle-radius':6,'circle-color':'#174d3d','circle-stroke-color':'#fffef7','circle-stroke-width':3}},
          {id:'focused-label',type:'symbol',source:'focused',layout:{'text-field':['get','name'],'text-font':['Inter Variable'],'text-size':14,'text-anchor':'bottom','text-offset':[0,-1.2],'text-allow-overlap':true},paint:{'text-color':'#173d30','text-halo-color':'#f5f4ee','text-halo-width':3}},
        ]},
      })
      map.current=instance
      if(window.innerWidth<768)instance.jumpTo({center:[8.538,47.376],zoom:12.7,padding:{top:0,left:0,right:0,bottom:window.innerHeight*.40}})
      instance.touchZoomRotate.disableRotation()
      instance.on('load',()=>{setReady(true)})
      instance.on('error',e=>{if(/worker|webgl|context/i.test(e.error.message))setFailed(true)})
      instance.on('click',e=>{
        const places=instance.queryRenderedFeatures(e.point,{layers:['stop-hit']})
        if(places[0]){callbacks.current.onPlace(String(places[0].properties.id));return}
        const lines=instance.queryRenderedFeatures(e.point,{layers:['network-hit']})
        const choices=[...new Set(lines.map(f=>String(f.properties.line)))]
        if(choices.length===1)callbacks.current.onLine(choices[0])
        else if(choices.length>1){
          const wrapper=document.createElement('div');wrapper.className='map-choices'
          const title=document.createElement('p');title.textContent='Linie auswählen';wrapper.append(title)
          const popup=new maplibregl.Popup({closeButton:true,maxWidth:'220px'}).setLngLat(e.lngLat)
          choices.sort((a,b)=>Number(a)-Number(b)).forEach(line=>{const b=document.createElement('button');b.type='button';b.textContent=line;b.setAttribute('aria-label',`Linie ${line} auswählen`);b.onclick=()=>{callbacks.current.onLine(line);popup.remove()};wrapper.append(b)})
          popup.setDOMContent(wrapper).addTo(instance)
        }
      })
      instance.on('mousemove',e=>{const hits=instance.queryRenderedFeatures(e.point,{layers:['stop-hit','network-hit']});instance.getCanvas().style.cursor=hits.length?'pointer':''})
      const canvas=instance.getCanvas();canvas.setAttribute('aria-label','Interaktive Karte des Zürcher Tramnetzes');canvas.setAttribute('role','img')
      const contextLost=(e:Event)=>{e.preventDefault();setFailed(true)}
      canvas.addEventListener('webglcontextlost',contextLost)
      const observer=new ResizeObserver(()=>instance.resize());observer.observe(container.current!)
      return ()=>{observer.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);instance.remove();map.current=null}
    } catch { setFailed(true) }
  },[retry]) // The map is mounted once; updates happen through its small imperative interface.

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return
    const {selection:s,catalog}=props
    let selected:FeatureCollection=empty
    if(s.kind==='line')selected={type:'FeatureCollection',features:props.data.network.features.filter(f=>f.properties?.line===s.line&&f.properties?.direction===s.direction)}
    if(s.kind==='exercise')selected=catalog.exercises.find(e=>e.id===s.id)?.geometry??empty
    ;(m.getSource('selected') as GeoJSONSource).setData(selected)
    m.setPaintProperty('network','line-opacity',s.kind==='overview'?0.62:0.16)
    m.setPaintProperty('selection','line-color',s.kind==='line'?(catalog.routes.find(r=>r.line===s.line)?.color??'#174d3d'):'#174d3d')
    let coords:Position[]=[]
    const walk=(v:unknown):void=>{if(Array.isArray(v)){if(typeof v[0]==='number')coords.push(v as Position);else v.forEach(walk)}}
    selected.features.forEach(f=>{if(f.geometry.type!=='GeometryCollection')walk(f.geometry.coordinates)})
    if(s.kind==='place'){const stop=[...catalog.stops,...catalog.streets].find(x=>x.id===s.id);if(stop)coords=[stop.coordinates]}
    if(s.kind==='overview')return
    if(coords.length){const bounds=new maplibregl.LngLatBounds();coords.forEach(p=>bounds.extend([p[0],p[1]]));const mobile=window.innerWidth<768;m.fitBounds(bounds,{padding:mobile?{top:80,left:42,right:42,bottom:props.panelExpanded?window.innerHeight*.65:window.innerHeight*.43}:{top:90,left:80,right:80,bottom:90},maxZoom:s.kind==='place'?15.5:14.4,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:700})}
  },[props.selection,ready])

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return
    const id=props.focusedStop??(props.selection.kind==='place'?props.selection.id:null)
    const place=[...props.catalog.stops,...props.catalog.streets].find(s=>s.id===id)
    const f:FeatureCollection['features']=place?[{type:'Feature',geometry:{type:'Point',coordinates:place.coordinates},properties:{name:place.name}}]:[]
    ;(m.getSource('focused') as GeoJSONSource).setData({type:'FeatureCollection',features:f})
    const focused=props.catalog.stops.find(s=>s.id===props.focusedStop)
    if(focused){const mobile=window.innerWidth<768;m.easeTo({center:focused.coordinates,zoom:Math.max(m.getZoom(),14.5),padding:mobile?{top:40,left:0,right:0,bottom:window.innerHeight*(props.panelExpanded ? .63 : .37)}:{top:0,left:0,right:0,bottom:0},duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:500})}
  },[props.focusedStop,props.selection,ready])

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return
    m.setLayoutProperty('major-labels','visibility',props.hideLabels?'none':'visible')
    m.setLayoutProperty('minor-labels','visibility',props.hideLabels?'none':'visible')
    m.setLayoutProperty('focused-label','visibility',props.hideLabels?'none':'visible')
  },[props.hideLabels,ready])

  function reset(){const m=map.current;if(!m||!ready)return;const b=new maplibregl.LngLatBounds();props.catalog.stops.forEach(s=>b.extend(s.coordinates));const mobile=window.innerWidth<768;m.fitBounds(b,{padding:mobile?{top:65,bottom:window.innerHeight*.43,left:20,right:20}:70,duration:500})}

  return <section className="map-area" aria-label="Netzkarte">
    <div ref={container} className="map-canvas" data-testid="map" data-ready={ready&&!failed}/>
    <div className="map-heading" aria-hidden="true"><span className="eyebrow">DAS NETZ IM BLICK</span><span>Zürich und Umgebung <ArrowUpRight size={13}/></span></div>
    <div className="map-controls">
      <Button variant="outline" size="icon" aria-label="Vergrössern" disabled={!ready||failed} onClick={()=>map.current?.zoomIn()}><Plus/></Button>
      <Button variant="outline" size="icon" aria-label="Verkleinern" disabled={!ready||failed} onClick={()=>map.current?.zoomOut()}><Minus/></Button>
      <Button variant="outline" size="icon" aria-label="Ganzes Netz anzeigen" disabled={!ready||failed} onClick={reset}><LocateFixed/></Button>
    </div>
    <div className="map-attribution">Geodaten © Kanton Zürich · CC0</div>
    {!ready&&!failed&&<div className="map-notice" role="status">Die Karte wird aufgebaut …</div>}
    {failed&&<div className="map-notice" role="alert"><strong>Die Karte kann nicht dargestellt werden.</strong><p>Linien und Haltestellen kannst du weiterhin in der Liste erkunden.</p><Button variant="outline" onClick={()=>setRetry(v=>v+1)}>Karte erneut laden</Button></div>}
  </section>
}
