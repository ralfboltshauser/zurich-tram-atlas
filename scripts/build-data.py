"""Rebuild a bounded static learning map from official canton Zurich WFS data.

Source geometry is authoritative publication, not proof of present operating validity.
No inferred switches or automatic routing. Raw sources stay out of the public bundle.
"""
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'scripts/raw'
OUT = ROOT / 'public/data'
RAW.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)
SOURCE = 'https://maps.zh.ch/wfs/OGDZHWFS'
TYPES = {
    'segments': 'ogd-0108_giszhpub_zvv_linien_l',
    'routes': 'ogd-0108_giszhpub_zvv_linien_gen_l',
    'stops': 'ogd-0140_giszhpub_zvv_haltestellen_p',
    'water': 'ogd-0281_giszhpub_wb_unterhalt_seen_f',
    'rivers': 'ogd-0045_giszhpub_wb_fliessgewaesser_l',
    'roads': 'ogd-0476_arv_basis_avzh_strassenachsen_l',
}

def source(name):
    p = RAW / f'{name}.json'
    if not p.exists():
        params = dict(service='WFS', version='2.0.0', request='GetFeature',
                      typenames='ms:' + TYPES[name], outputFormat='application/json; subtype=geojson',
                      srsName='EPSG:4326', count=100000)
        if name in ('segments', 'routes'):
            params['filter'] = '<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>betriebszweig_txt</PropertyName><Literal>VBZ-Tram</Literal></PropertyIsEqualTo></Filter>'
        elif name != 'stops':
            params['bbox'] = '8.39,47.30,8.63,47.47,urn:ogc:def:crs:OGC:1.3:CRS84'
        r = requests.get(SOURCE, params=params, timeout=120)
        r.raise_for_status()
        p.write_text(r.text)
    data = json.loads(p.read_text())
    assert data.get('type') == 'FeatureCollection', name
    if 'numberMatched' in data:
        assert len(data['features']) >= int(data['numberMatched']), 'Source truncated: ' + name
    return data['features']

def rounded(obj):
    if isinstance(obj, float): return round(obj, 6)
    if isinstance(obj, dict): return {k: rounded(v) for k,v in obj.items()}
    if isinstance(obj, (tuple,list)): return [rounded(v) for v in obj]
    return obj

def feature(geometry, properties):
    return dict(type='Feature', geometry=rounded(mapping(geometry)), properties=properties)

def collection(features): return dict(type='FeatureCollection', features=features)
def write(name, data): (OUT/name).write_text(json.dumps(rounded(data), ensure_ascii=False, separators=(',', ':')))
def clean(name): return name.replace('Zürich, ', '').replace('Zürich,', '').replace('Zch, ', '')

segments = source('segments')
# Internal service identifiers 50/51 are deliberately excluded rather than guessed.
segments = [f for f in segments if f['properties']['liniennummer'] not in ('50','51')]
all_stops = {str(int(f['properties']['diva_nr'])): f for f in source('stops')}
# Missing source stop 972 is an unnamed operating point. Drop its incident segment
# rather than invent a passenger stop or endpoint; explain this in metadata.
segments = [f for f in segments if all(str(int(f['properties'][k])) in all_stops for k in ('vonhaltestellennr','bishaltestellennr'))]
groups = defaultdict(list)
for f in segments:
    p=f['properties'];groups[(p['liniennummer'], int(p['richtung']))].append(f)

COLORS = {'2':'#9e2639','3':'#197946','4':'#342f68','5':'#89532e','6':'#8b5700','7':'#202628','8':'#b75514','9':'#204c9d','10':'#a82b69','11':'#176743','12':'#315b89','13':'#82650e','14':'#137b8b','15':'#a42736','17':'#805c8d'}
stop_lines = defaultdict(set)
routes=[];route_features=[];simplified_segments=[]
for (line, direction), fs in sorted(groups.items(), key=lambda g:(int(g[0][0]),g[0][1])):
    fs.sort(key=lambda f:f['properties']['sequenznr'])
    ids=[]
    for f in fs:
        p=f['properties']
        a,b=[str(int(p[k])) for k in ('vonhaltestellennr','bishaltestellennr')]
        if not ids: ids.append(a)
        assert ids[-1] == a, f'Non-contiguous route {line}/{direction}'
        if b != ids[-1]:ids.append(b)
        geom=shape(f['geometry']).simplify(0.000008, preserve_topology=True)
        simplified_segments.append((a,b,geom,line,direction))
        route_features.append(feature(geom,dict(line=line,direction=direction,color=COLORS[line])))
    for sid in ids:stop_lines[sid].add(line)
    routes.append(dict(id=f'{line}-{direction}',line=line,direction=direction,color=COLORS[line],
        origin=clean(all_stops[ids[0]]['properties']['chstname']),
        destination=clean(all_stops[ids[-1]]['properties']['chstname']),stopIds=ids))

MAJOR={'Paradeplatz','Bellevue','Central','Bahnhofplatz/HB','Bahnhofstrasse/HB','Kunsthaus','Kreuzplatz','Stauffacher','Bahnhof Enge','Bahnhof Stadelhofen','Bahnhof Oerlikon','Schaffhauserplatz','Escher-Wyss-Platz','Milchbuck','Albisriederplatz','Bucheggplatz','Bahnhof Stettbach','Bürkliplatz','Stockerstrasse'}
stops=[];stop_features=[]
for sid, lines in stop_lines.items():
    f=all_stops[sid];name=clean(f['properties']['chstname']);coords=f['geometry']['coordinates']
    st=dict(id=sid,name=name,coordinates=coords,lines=sorted(lines,key=int),major=name in MAJOR)
    stops.append(st)
    stop_features.append(dict(type='Feature',id=int(sid),geometry=rounded(f['geometry']),properties=dict(id=sid,name=name,major=int(name in MAJOR),priority=0 if name in MAJOR else 1)))

network = unary_union([g for a,b,g,l,d in simplified_segments])
near = network.buffer(0.00065)
context=[]
street_shapes=defaultdict(list)
for f in source('roads'):
    if not f['geometry']:continue
    g=shape(f['geometry']);name=f['properties'].get('text','')
    if name and g.intersects(near):
        context.append(feature(g.simplify(0.000025),dict(kind='street',name=name)))
        street_shapes[name].append(g.intersection(near))
extent=box(8.39,47.30,8.63,47.47)
for f in source('water'):
    g=shape(f['geometry']).intersection(extent).simplify(0.00004,preserve_topology=True)
    context.append(feature(g,dict(kind='water',name=f['properties']['seename'])))
for f in source('rivers'):
    p=f['properties']
    if p['gewaessername'] in ('Limmat','Sihl','Glatt') and p['offen_eingedolt_txt']=='offen':
        context.append(feature(shape(f['geometry']).simplify(0.00002),dict(kind='river',name=p['gewaessername'])))

# This example is assembled exclusively from published service segments, but the
# direction change at Römerhof is NOT operationally reviewed. Never call it approved.
by_name={s['name']:s['id'] for s in stops}
names=['Bellevue','Bahnhof Stadelhofen','Kreuzplatz','Englischviertelstrasse','Römerhof','Hottingerplatz','Kunsthaus']
path_ids=[by_name[n] for n in names]
path=[]
for i,(a,b) in enumerate(zip(path_ids,path_ids[1:])):
    candidates=[(g,l,d) for aa,bb,g,l,d in simplified_segments if aa==a and bb==b]
    assert candidates, (a,b)
    preferred='2' if i<4 else '3'
    geom,line,d=next((x for x in candidates if x[1]==preferred),candidates[0])
    path.append(feature(geom,dict(line=line,direction=d)))
exercise=dict(id='bellevue-kunsthaus',title='Vom See zum Kunsthaus',subtitle='Via Kreuzplatz und Römerhof',
    status='unreviewed',stopIds=path_ids,geometry=collection(path),
    note='Übungsweg aus veröffentlichten Liniensegmenten. Der Richtungswechsel am Römerhof und die betriebliche Befahrbarkeit sind nicht geprüft. Keine freigegebene Umleitung.')

streets=[]
for name,gs in sorted(street_shapes.items()):
    g=unary_union(gs)
    if g.is_empty:continue
    point=g.interpolate(.5,normalized=True)
    lines=sorted({l for a,b,geom,l,d in simplified_segments if geom.distance(g)<.00022},key=int)
    streets.append(dict(id='street-'+name,name=name,coordinates=[point.x,point.y],lines=lines,major=False,kind='street'))

write('network.geojson',collection(route_features))
write('stops.geojson',collection(stop_features))
write('context.geojson',collection(context))
write('catalog.json',dict(routes=routes,stops=stops,streets=streets,exercises=[exercise],metadata=dict(
    sourceDate='17.12.2025',downloadedAt=datetime.now(timezone.utc).isoformat(),
    licence='CC0 · Kanton Zürich / ZVV / VBZ',source=SOURCE,
    notes=['Kein Echtzeitnetz. Betriebliche Änderungen seit dem Quellenstand sind nicht bestätigt.',
           'Interne Linien 50/51 sind nicht enthalten. Unbenannter Betriebspunkt 972 der Linie 10 ist ausgelassen.',
           'Linienfarben sind Orientierungshilfen, keine bestätigte offizielle Farbzuordnung.',
           'Keine betrieblich geprüften Umleitungen vorhanden. Der Lernweg ist ausdrücklich ein ungeprüftes Beispiel.'])))
print(f'Built {len(routes)} directional routes, {len(stops)} stops, {len(context)} context features')
for f in OUT.iterdir():print(f.name, f.stat().st_size)
