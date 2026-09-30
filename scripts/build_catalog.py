import json,re,time,hashlib
from datetime import datetime,timezone
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

OUT='novels-catalog.json'
items={}

def clean(s): return re.sub(r'\s+',' ',s or '').strip()
def add(source,title,url,author='',chapters=None,status='',genres=None,cover='',synopsis='',alternative=''):
    title=clean(title)
    if not title or not url: return
    key=(source+'|'+url).lower()
    items[key]={
      'source':source,'title':title,'alternative':clean(alternative),'author':clean(author),
      'chapters':chapters,'status':clean(status),'genres':[clean(x) for x in (genres or []) if clean(x)],
      'cover':cover,'synopsis':clean(synopsis),'url':url,'language':'EN',
      'sources':[{'site':source,'url':url,'lang':'EN'}]
    }

def number(s):
    if not s:return None
    m=re.search(r'(\d[\d,]*)\s*chapters?',s,re.I)
    return int(m.group(1).replace(',','')) if m else None

def scrape_novelfull(page,base,source,max_pages=150):
    seen=set()
    roots=[base+'/novel-list',base+'/completed-novel',base+'/']
    for root in roots:
      for pno in range(1,max_pages+1):
        url=root if pno==1 else root+'?page='+str(pno)
        try:
          page.goto(url,wait_until='domcontentloaded',timeout=45000)
          page.wait_for_timeout(500)
        except Exception: continue
        links=page.locator('a[href]').all()
        found=0
        for a in links:
          try:
            href=a.get_attribute('href') or ''; txt=clean(a.inner_text())
          except Exception: continue
          if source=='NovelFull.com': ok=re.search(r'/[^/]+\.html$',href) and 'chapter' not in href.lower()
          else: ok=re.search(r'/[^/]+\.html$',href) and 'chapter' not in href.lower()
          if not ok or not txt or len(txt)<2 or len(txt)>180: continue
          u=urljoin(base,href)
          if u in seen: continue
          seen.add(u);found+=1
          # Visit detail page for metadata; limit expensive pages to unique works.
          try:
            page.goto(u,wait_until='domcontentloaded',timeout=30000); page.wait_for_timeout(200)
            body=clean(page.locator('body').inner_text())
            title=clean((page.locator('h1').first.inner_text() if page.locator('h1').count() else txt))
            author=''
            ma=re.search(r'Author\s*:\s*([^\n]+)',body,re.I)
            if ma: author=clean(ma.group(1))
            status=''
            ms=re.search(r'Status\s*:\s*([^\n]+)',body,re.I)
            if ms: status=clean(ms.group(1))
            ch=number(body)
            gens=[]
            mg=re.search(r'Genre\s*:\s*([^\n]+)',body,re.I)
            if mg: gens=[x.strip() for x in re.split(r',|/',mg.group(1)) if x.strip()]
            img=''
            if page.locator('meta[property="og:image"]').count(): img=page.locator('meta[property="og:image"]').first.get_attribute('content') or ''
            add(source,title,u,author,ch,status,gens,img)
          except Exception:
            add(source,txt,u)
        if found==0 and pno>2: break


def scrape_wuxia(page,max_pages=80):
    base='https://www.wuxiaworld.com'; seen=set()
    for pno in range(1,max_pages+1):
      url=base+'/novels' if pno==1 else base+'/novels?page='+str(pno)
      try:
        page.goto(url,wait_until='domcontentloaded',timeout=60000);page.wait_for_timeout(1000)
      except Exception: continue
      hrefs=[]
      for a in page.locator('a[href*="/novel/"]').all():
        try:
          href=a.get_attribute('href') or '';txt=clean(a.inner_text())
        except Exception:continue
        if href and txt and href.rstrip('/') not in seen: hrefs.append((urljoin(base,href),txt))
      if not hrefs and pno>2: break
      for u,txt in hrefs:
        seen.add(u)
        try:
          page.goto(u,wait_until='domcontentloaded',timeout=45000);page.wait_for_timeout(500)
          body=clean(page.locator('body').inner_text())
          title=clean(page.locator('h1').first.inner_text() if page.locator('h1').count() else txt)
          ma=re.search(r'Author:\s*([^\n]+)',body,re.I); author=clean(ma.group(1)) if ma else ''
          st='Completed' if re.search(r'\bCompleted\b',body) else ('Ongoing' if re.search(r'\bOngoing\b',body) else '')
          ch=number(body)
          mg=re.search(r'Chapters\s+\d[\d,]*\s+Chapters\s+Licensed',body,re.I)
          gens=[]
          # Use compact genre run immediately before Synopsis when available.
          ms=re.search(r'Licensed From.*?\n(.{0,250})\nSynopsis',body,re.I)
          if ms: gens=[x.strip() for x in re.findall(r'[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?',ms.group(1))]
          img=page.locator('meta[property="og:image"]').first.get_attribute('content') if page.locator('meta[property="og:image"]').count() else ''
          add('Wuxiaworld',title,u,author,ch,st,gens,img)
        except Exception: add('Wuxiaworld',txt,u)

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1200},user_agent='Mozilla/5.0 (compatible; OtakuLibraryCatalog/1.0)')
  scrape_novelfull(page,'https://novelfull.com','NovelFull.com')
  scrape_novelfull(page,'https://novelfull.net','NovelFull.net')
  scrape_wuxia(page)
  browser.close()

# Deduplicate cross-source copies by normalized title + author while preserving all source links.
groups={}
def norm(s): return re.sub(r'[^a-z0-9]+','', (s or '').lower())
for it in items.values():
  k=norm(it['title'])+'|'+norm(it.get('author',''))
  groups.setdefault(k,[]).append(it)
out=[]
for group in groups.values():
  main=dict(group[0]); src=[]
  for it in group:
    src.extend(it.get('sources',[]))
    if not main.get('author'): main['author']=it.get('author','')
    if not main.get('cover'): main['cover']=it.get('cover','')
    if not main.get('synopsis'): main['synopsis']=it.get('synopsis','')
    if (it.get('chapters') or 0)>(main.get('chapters') or 0): main['chapters']=it['chapters']
    if not main.get('status'): main['status']=it.get('status','')
    main['genres']=sorted(set(main.get('genres',[]))|set(it.get('genres',[])))
  uniq={(x['site'],x['url']):x for x in src};main['sources']=list(uniq.values());main['source']=main['sources'][0]['site'];out.append(main)
out.sort(key=lambda x:(x.get('title') or '').lower())
json.dump({'updated_at':datetime.now(timezone.utc).isoformat(),'items':out},open(OUT,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('catalog entries:',len(out))
