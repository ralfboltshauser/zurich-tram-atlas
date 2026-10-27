import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function ready(page:Page,path='/') {
  await page.goto(path)
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready','true')
}
async function expandPhone(page:Page){if((page.viewportSize()?.width??1440)<768&&await page.getByTestId('explorer-sheet').getAttribute('data-sheet-state')!=='expanded')await page.getByRole('button',{name:'Details erweitern'}).first().click()}

test('real map loads without application errors or third-party requests',async({page},testInfo)=>{
  const errors:string[]=[],remote:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(new URL(process.env.ATLAS_URL??'http://127.0.0.1:5190').origin))remote.push(r.url())})
  await ready(page)
  await expect(page.getByRole('button',{name:/^Linie \d+$/})).toHaveCount(15)
  await expect(page.getByText('Netzstand 17.12.2025')).toBeVisible()
  expect(await page.locator('.maplibregl-canvas').evaluate(c=>({width:(c as HTMLCanvasElement).width,height:(c as HTMLCanvasElement).height}))).toMatchObject({width:expect.any(Number),height:expect.any(Number)})
  await page.screenshot({path:`qa/${testInfo.project.name}-overview.png`})
  expect(errors).toEqual([]);expect(remote).toEqual([])
})

test('line direction, geographic stepping, recall and deep link persistence',async({page},testInfo)=>{
  await ready(page)
  await page.getByRole('button',{name:'Linie 7',exact:true}).click()
  await expect(page).toHaveURL(/linie=7&richtung=1/)
  await expandPhone(page)
  await expect(page.getByRole('heading',{name:'Wollishoferplatz',exact:true})).toBeVisible()
  const list=page.getByRole('list',{name:'Haltestellen im Verlauf'})
  await expect(list.getByRole('button').first()).toHaveAccessibleName('Bahnhof Stettbach auf Karte zeigen')
  await page.getByRole('button',{name:'Nächste Haltestelle'}).click()
  await expect(page.locator('.stop-list [aria-current="step"]')).toHaveAttribute('aria-label','Bahnhof Stettbach auf Karte zeigen')
  await page.getByRole('button',{name:'Nächste Haltestelle'}).click()
  await expect(page.locator('.stop-list [aria-current="step"]')).toHaveAttribute('aria-label','Mattenhof auf Karte zeigen')
  await page.getByRole('button',{name:'Vorherige Haltestelle'}).click()
  await expect(page.locator('.stop-list [aria-current="step"]')).toHaveAttribute('aria-label','Bahnhof Stettbach auf Karte zeigen')
  await expandPhone(page)
  await page.getByRole('switch',{name:'Namen ausblenden'}).click()
  await expect(list.getByRole('button').first()).toHaveAccessibleName('Haltestelle 1 auf Karte zeigen')
  await expect(page.getByText('Wie heisst die nächste Haltestelle?',{exact:false})).toBeVisible()
  await page.getByRole('switch',{name:'Namen ausblenden'}).click()
  await page.getByRole('button',{name:/Richtung wechseln/}).click()
  await expect(page).toHaveURL(/linie=7&richtung=0/)
  await expect(list.getByRole('button').first()).toHaveAccessibleName('Wollishoferplatz auf Karte zeigen')
  await page.reload();await expect(page.getByTestId('map')).toHaveAttribute('data-ready','true')
  await expect(page.getByRole('heading',{name:'Bahnhof Stettbach',exact:true})).toBeVisible()
  await page.screenshot({path:`qa/${testInfo.project.name}-line.png`})
  await page.goto('/');await expect(page).toHaveURL(/linie=7&richtung=0/)
})

test('keyboard search, empty results and place to line navigation',async({page})=>{
  await ready(page)
  const search=page.getByRole('combobox',{name:'Haltestelle oder Strasse suchen'})
  await search.fill('zzznosuchstop')
  await expect(page.getByText(/Kein Ort gefunden/)).toBeVisible()
  await search.fill('Paradeplatz')
  await expect(page.getByRole('option').first()).toBeVisible()
  await search.press('Enter')
  await expect(page.getByRole('heading',{name:'Paradeplatz',exact:true})).toBeVisible()
  await expect(page).toHaveURL(/ort=/)
  await expandPhone(page)
  await page.locator('.place-line').filter({has:page.getByText('7',{exact:true})}).click()
  await expect(page).toHaveURL(/linie=7/)
  await expect(page.getByRole('heading',{name:'Wollishoferplatz'})).toBeVisible()
})

test('learning path is usable and explicitly unreviewed',async({page},testInfo)=>{
  await ready(page,'/?lernweg=bellevue-kunsthaus')
  await expandPhone(page)
  await expect(page.getByRole('heading',{name:'Vom See zum Kunsthaus'})).toBeVisible()
  await expect(page.getByText('Ungeprüftes Beispiel',{exact:true})).toBeVisible()
  await expect(page.getByText(/Richtungswechsel am Römerhof/)).toBeVisible()
  const list=page.getByRole('list',{name:'Haltestellen im Verlauf'})
  await expect(list.getByRole('button')).toHaveCount(7)
  await expect(list.getByRole('button').first()).toHaveAccessibleName('Bellevue auf Karte zeigen')
  await expect(list.getByRole('button').last()).toHaveAccessibleName('Kunsthaus auf Karte zeigen')
  await list.getByRole('button',{name:'Kreuzplatz auf Karte zeigen',exact:true}).click()
  await expect(page.locator('.stop-list [aria-current="step"]')).toHaveAttribute('aria-label','Kreuzplatz auf Karte zeigen')
  await page.screenshot({path:`qa/${testInfo.project.name}-exercise.png`})
})

test('offline reload retains map, data, search and line selection',async({page,context})=>{
  await ready(page)
  await expect(page.getByText('Offline bereit',{exact:true})).toBeVisible({timeout:25000})
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
  await page.getByRole('button',{name:'Linie 3',exact:true}).click()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready','true')
  await expect(page.getByRole('heading',{name:'Klusplatz',exact:true})).toBeVisible()
  await expect(page.getByText('Offline',{exact:true})).toBeVisible()
  await page.getByRole('combobox').fill('Kunsthaus')
  await page.getByRole('option').first().click()
  await expect(page.getByRole('heading',{name:'Kunsthaus',exact:true})).toBeVisible()
  await context.setOffline(false)
})

test('missing data gives a useful retry and invalid links recover',async({page})=>{
  await page.route('**/data/catalog.json',r=>r.fulfill({status:503,body:'Unavailable'}))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Kartendaten konnten nicht geladen werden')
  await page.unroute('**/data/catalog.json')
  await page.getByRole('button',{name:'Erneut versuchen'}).click()
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready','true')
  await ready(page,'/?linie=999&richtung=1')
  await expect(page.getByRole('status')).toContainText('Diese Auswahl gibt es nicht mehr')
  await expect(page.getByRole('button',{name:'Linie 7',exact:true})).toBeVisible()
})

test('share and source dialogs work; layout fits the viewport',async({page})=>{
  await ready(page,'/?linie=7&richtung=1')
  await page.getByRole('button',{name:'Linie teilen'}).click()
  await expect(page.getByRole('textbox',{name:'Link zur Ansicht'})).toHaveValue(/linie=7&richtung=1/)
  await page.getByRole('button',{name:'Schliessen',exact:true}).click()
  await page.getByRole('button',{name:'Über die Karte'}).click()
  await expect(page.getByRole('dialog',{name:'Eine Karte zum Verstehen.'})).toContainText('Die Aktualität für den heutigen Betrieb ist nicht bestätigt')
  await page.getByRole('button',{name:'Schliessen',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  if((page.viewportSize()?.width??0)<768){
    await page.getByRole('button',{name:'Details erweitern'}).first().click()
    const sidebar=await page.locator('.sidebar').boundingBox();expect(sidebar!.y).toBeGreaterThan(64)
    await page.getByRole('button',{name:'Details verkleinern'}).first().click()
  }
})

test('controls have accessible names and sufficient contrast',async({page})=>{
  await ready(page)
  for(const path of ['/', '/?linie=7&richtung=1', '/?lernweg=bellevue-kunsthaus', '/?ort=1861']){
    await ready(page,path)
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([])
  }
})


test('street search and browser Back preserve the matching screen',async({page})=>{
  await ready(page)
  await page.getByRole('combobox').fill('Stockerstrasse')
  const street=page.getByRole('option').filter({hasText:'Strasse · Linien in der Umgebung'})
  await street.click()
  await expect(page.getByRole('heading',{name:'Stockerstrasse',exact:true})).toBeVisible()
  await expect(page.locator('.place-detail')).toContainText('STRASSE')
  await page.getByRole('tab',{name:/Lernwege/}).click()
  await expandPhone(page)
  await page.getByRole('button',{name:/Vom See zum Kunsthaus/}).click()
  await expect(page.getByRole('heading',{name:'Vom See zum Kunsthaus'})).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading',{name:'Stockerstrasse',exact:true})).toBeVisible()
  await expect(page.getByRole('tab',{name:'Linien',exact:true})).toHaveAttribute('aria-selected','true')
})

test('local storage denial does not prevent map exploration',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}}))
  await ready(page)
  await page.getByRole('button',{name:'Linie 7',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Wollishoferplatz'})).toBeVisible()
})

test('renderer failure leaves an actionable textual route view',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null
      return original.apply(this,[type,...args] as never)
    } as typeof original
  })
  await page.goto('/?linie=7&richtung=1')
  await expect(page.getByRole('alert')).toContainText('Die Karte kann nicht dargestellt werden')
  await expandPhone(page)
  await expect(page.getByRole('list',{name:'Haltestellen im Verlauf'}).getByRole('button').first()).toHaveAccessibleName('Bahnhof Stettbach auf Karte zeigen')
  await expect(page.getByRole('button',{name:'Karte erneut laden'})).toBeVisible()
})
