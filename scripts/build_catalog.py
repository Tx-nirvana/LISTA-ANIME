#!/usr/bin/env python3
"""
Construtor do catálogo de WEB Novels da Biblioteca Otaku.

FONTES DE LEITURA (rígidas):
  - https://novelfull.com
  - https://novelfull.net
  - https://wuxiaworld.com

FONTE AUXILIAR DE METADADOS:
  - Kitsu API (não é adicionada como fonte de leitura)

Uso:
  python scripts/build_catalog.py
  python scripts/build_catalog.py --query "nome da novel" --format json
  python scripts/build_catalog.py --query "nome da novel" --format txt --output resultados.txt
"""
import argparse
import json
import re
import time
import os
import sys
import logging
import unicodedata
from urllib.robotparser import RobotFileParser
from datetime import datetime, timezone
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


OUT = "novels-catalog.json"
ALLOWED_DOMAINS = {
    "novelfull.com": "NovelFull.com",
    "novelfull.net": "NovelFull.net",
    "wuxiaworld.com": "Wuxiaworld",
}
UA = "Mozilla/5.0 (compatible; OtakuLibraryCatalog/2.0; +https://github.com/Tx-nirvana/LISTA-ANIME)"
items = {}
LOG = logging.getLogger('catalogo')
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
ROBOTS = {}
REQUEST_DELAY = 1.0
MAX_DETAILS = int(os.getenv('CATALOG_MAX_DETAILS', '90'))
METADATA_LIMIT = int(os.getenv('CATALOG_METADATA_LIMIT', '80'))


def permitted(url):
    """Não contorna robots.txt, captcha ou bloqueio da fonte."""
    origin = '{0.scheme}://{0.netloc}'.format(urlparse(url))
    if origin not in ROBOTS:
        parser = RobotFileParser(origin + '/robots.txt')
        try:
            with urlopen(Request(parser.url, headers={'User-Agent': UA}), timeout=15) as r:
                parser.parse(r.read().decode('utf-8', errors='replace').splitlines())
            ROBOTS[origin] = parser
        except HTTPError as error:
            ROBOTS[origin] = True if error.code == 404 else False
        except Exception:
            ROBOTS[origin] = False
        if ROBOTS[origin] is False:
            LOG.warning('Sem autorização verificável em robots.txt: %s; preservando dados anteriores', origin)
    rule = ROBOTS[origin]
    return rule if isinstance(rule, bool) else rule.can_fetch(UA, url)


def visit(page, url, timeout=30000):
    if not permitted(url):
        raise RuntimeError('A fonte não permite esta coleta')
    rule = ROBOTS.get('{0.scheme}://{0.netloc}'.format(urlparse(url)))
    delay = (rule.crawl_delay(UA) or rule.crawl_delay('*') or REQUEST_DELAY) if isinstance(rule, RobotFileParser) else REQUEST_DELAY
    time.sleep(max(REQUEST_DELAY, delay))
    response = page.goto(url, wait_until='domcontentloaded', timeout=timeout)
    code = getattr(response, 'status', 200)
    if code in (403, 429):
        raise RuntimeError('Fonte bloqueada ou limite de requisições: HTTP ' + str(code))
    if isinstance(code, int) and code >= 400:
        raise RuntimeError('HTTP ' + str(code))
    return response


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def domain_allowed(url):
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().removeprefix("www.")
        return parsed.scheme in ("http", "https") and not parsed.username and not parsed.password and host in ALLOWED_DOMAINS
    except Exception:
        return False


def source_for(url):
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        return ALLOWED_DOMAINS.get(host, "")
    except Exception:
        return ""


def novel_url(url):
    if not domain_allowed(url):
        return False
    p = urlparse(url)
    if source_for(url) == 'Wuxiaworld':
        return bool(re.fullmatch(r'/novel/[^/]+/?', p.path))
    return bool(re.fullmatch(r'/[^/]+\.html', p.path)) and not re.search(r'/(?:chapter|privacy|terms|contact|dmca|login|register)', p.path, re.I)


def novel_slug(url):
    return norm(urlparse(url).path.strip('/').split('/')[-1].removesuffix('.html'))


def page_title(page, fallback):
    """H1 pode ser o gênero no rodapé; usa o título social ou o link da listagem."""
    try:
        meta = page.locator('meta[property="og:title"]')
        value = clean(meta.first.get_attribute('content')) if meta.count() else ''
        value = re.sub(r'\s*[-|]\s*(?:NovelFull|Wuxiaworld).*$', '', value, flags=re.I)
        value = re.sub(r'^Read\s+|\s+online free$', '', value, flags=re.I).strip()
        return value if value and len(value) <= 180 else clean(fallback)
    except Exception:
        return clean(fallback)


def safe_url(url, base=None):
    if not url:
        return ""
    u = urljoin(base or "", url)
    return u if domain_allowed(u) else ""


def add(source, title, url, author="", chapters=None, status="", genres=None,
        cover="", synopsis="", alternative="", year="", rating=None,
        metadata_source="", metadata_url=""):
    title = clean(title)
    url = safe_url(url)
    if not title or not url or not novel_url(url) or source != source_for(url):
        return
    key = (source + "|" + url).lower()
    item = {
        "source": source,
        "title": title,
        "alternative": clean(alternative),
        "author": clean(author),
        "chapters": chapters,
        "status": clean(status),
        "genres": sorted({clean(x) for x in (genres or []) if clean(x)}),
        "cover": cover or "",
        "synopsis": clean(synopsis),
        "year": str(year or ""),
        "rating": rating,
        "url": url,
        "language": "EN",
        "sources": [{"site": source, "url": url, "lang": "EN"}],
    }
    if metadata_source:
        item["metadata_source"] = metadata_source
    if metadata_url:
        item["metadata_url"] = metadata_url
    items[key] = item


def number(value):
    if not value:
        return None
    m = re.search(r"(\d[\d,]*)\s*chapters?", str(value), re.I)
    return int(m.group(1).replace(",", "")) if m else None


def http_json(url, timeout=20):
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.api+json, application/json"})
    for attempt in range(3):
        try:
            time.sleep(REQUEST_DELAY)
            with urlopen(req, timeout=timeout) as response:
                if response.status != 200:
                    return None
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                LOG.warning('Metadados indisponíveis: HTTP %s', error.code)
                return None
            wait = min(30, int(error.headers.get('Retry-After', '2')) if str(error.headers.get('Retry-After', '2')).isdigit() else 2 ** (attempt + 1))
            time.sleep(wait)
        except (URLError, TimeoutError, ValueError):
            if attempt == 2:
                return None
            time.sleep(2 ** attempt)
    return None


def norm(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', clean(value).casefold()) if not unicodedata.combining(c))
    return re.sub(r'[\W_]+', '', value, flags=re.UNICODE)


def kitsu_enrich(title):
    """Kitsu é apenas auxiliar: nunca cria link de leitura fora dos 3 domínios."""
    if not title:
        return {}
    endpoint = (
        "https://kitsu.io/api/edge/manga"
        "?filter[subtype]=novel"
        "&page[limit]=10&include=mangaStaff.person,categories"
        "&filter[text]=" + quote(title)
    )
    data = http_json(endpoint)
    if not data:
        return {}
    wanted = norm(title)
    best = None
    best_object = None
    best_score = -1
    for obj in data.get("data", []):
        a = obj.get("attributes") or {}
        names = [
            a.get("canonicalTitle"),
            a.get("slug"),
            *(a.get("abbreviatedTitles") or []),
            *[v for v in (a.get("titles") or {}).values() if v],
        ]
        score = 0
        for name in names:
            n = norm(name)
            if n == wanted:
                score = max(score, 100)
            elif n and wanted and (wanted in n or n in wanted):
                score = max(score, 70)
        if score > best_score:
            best_score, best, best_object = score, a, obj
    if not best or best_score < 100:
        return {}
    cover = (best.get("posterImage") or {}).get("large") or (best.get("coverImage") or {}).get("original") or ""
    status_map = {
        "current": "Ongoing",
        "finished": "Completed",
        "tba": "Not Yet Released",
        "unreleased": "Not Yet Released",
        "upcoming": "Not Yet Released",
    }
    included = {(x.get('type'), str(x.get('id'))): x for x in data.get('included', [])}
    genres = []
    authors = []
    relationships = (best_object or {}).get('relationships', {})
    for rel in relationships.get('categories', {}).get('data', []) or []:
        category = included.get((rel.get('type'), str(rel.get('id'))), {}).get('attributes', {})
        if category.get('title'):
            genres.append(clean(category['title']))
    for rel in relationships.get('mangaStaff', {}).get('data', []) or []:
        staff = included.get((rel.get('type'), str(rel.get('id'))), {})
        role = clean(staff.get('attributes', {}).get('role'))
        person_rel = staff.get('relationships', {}).get('person', {}).get('data') or {}
        person = included.get((person_rel.get('type'), str(person_rel.get('id'))), {}).get('attributes', {})
        name = clean(person.get('name'))
        if name and re.search(r'author|story|original|writer', role, re.I):
            authors.append(name)
    # A segunda chamada traz categorias/gêneros quando disponíveis.
    # Falha nessa etapa não invalida o resultado principal.
    slug = best.get("slug") or ""
    return {
        "title": clean(best.get("canonicalTitle") or title),
        "alternative": clean(", ".join(best.get("abbreviatedTitles") or [])),
        "chapters": best.get("chapterCount"),
        "status": status_map.get(best.get("status"), ""),
        "cover": cover,
        "synopsis": clean(best.get("synopsis")),
        "year": str(best.get("startDate") or "")[:4],
        "rating": round(float(best.get("averageRating"))) if best.get("averageRating") else None,
        "metadata_source": "Kitsu",
        "metadata_url": "https://kitsu.io/manga/" + slug if slug else "",
        "genres": genres,
        "author": ', '.join(dict.fromkeys(authors)),
    }


def apply_kitsu(item):
    try:
        meta = kitsu_enrich(item.get("title"))
        if not meta:
            return
        # Kitsu só complementa o catálogo; não substitui dados mais específicos da fonte.
        for field in ("alternative", "author", "chapters", "status", "cover", "synopsis", "year", "rating"):
            if not item.get(field) and meta.get(field):
                item[field] = meta[field]
        if meta.get("genres"):
            item["genres"] = sorted(set(item.get("genres", [])) | set(meta["genres"]))
        item["metadata_source"] = "Kitsu"
        if meta.get("metadata_url"):
            item["metadata_url"] = meta["metadata_url"]
    except Exception:
        pass


def scrape_novelfull(page, base, source, max_pages=None):
    max_pages = max_pages or int(os.getenv('CATALOG_MAX_PAGES', '4'))
    seen = set()
    roots = [base + '/genre/Xianxia', base + '/genre/Xuanhuan', base + '/genre/Wuxia', base + '/novel-list', base + '/completed-novel']
    rotation = datetime.now(timezone.utc).timetuple().tm_yday % len(roots)
    roots = roots[rotation:] + roots[:rotation]
    for root in roots:
        for pno in range(1, max_pages + 1):
            url = root if pno == 1 else root + "?page=" + str(pno)
            try:
                visit(page, url, timeout=45000)
                page.wait_for_timeout(400)
            except Exception as error:
                LOG.warning('%s: %s', url, error)
                break
            found = 0
            links = []
            for a in page.locator("a[href]").all():
                try:
                    links.append((a.get_attribute("href") or "", clean(a.inner_text())))
                except Exception:
                    continue
            for href, txt in links:
                u = safe_url(href, base)
                if not u or source_for(u) != source:
                    continue
                path = urlparse(u).path.lower()
                if not novel_url(u) or "chapter" in path:
                    continue
                if not txt or len(txt) < 2 or len(txt) > 180 or u in seen:
                    continue
                seen.add(u)
                if len(seen) > MAX_DETAILS:
                    LOG.info('%s: orçamento de %s obras atingido', source, MAX_DETAILS)
                    return
                found += 1
                try:
                    visit(page, u)
                    page.wait_for_timeout(200)
                    body = page.locator("body").inner_text()
                    title = page_title(page, txt)
                    ma = re.search(r"Author\s*:\s*([^\n]+)", body, re.I)
                    ms = re.search(r"Status\s*:\s*([^\n]+)", body, re.I)
                    mg = re.search(r"Genre\s*:\s*([^\n]+)", body, re.I)
                    img = page.locator('meta[property="og:image"]').first.get_attribute("content") if page.locator('meta[property="og:image"]').count() else ""
                    add(source, title, u, clean(ma.group(1)) if ma else "", number(body),
                        clean(ms.group(1)) if ms else "",
                        [x.strip() for x in re.split(r",|/", mg.group(1))] if mg else [],
                        img or "")
                except Exception:
                    add(source, txt, u)
            if found == 0 and pno > 2:
                break


def scrape_wuxia(page, max_pages=None):
    max_pages = max_pages or int(os.getenv('CATALOG_MAX_PAGES', '4'))
    base = "https://www.wuxiaworld.com"
    seen = set()
    for pno in range(1, max_pages + 1):
        url = base + "/novels" if pno == 1 else base + "/novels?page=" + str(pno)
        try:
            visit(page, url, timeout=60000)
            page.wait_for_timeout(700)
        except Exception as error:
            LOG.warning('%s: %s', url, error)
            break
        hrefs = []
        for a in page.locator('a[href*="/novel/"]').all():
            try:
                href = a.get_attribute("href") or ""
                txt = clean(a.inner_text())
            except Exception:
                continue
            u = safe_url(href, base)
            if u and novel_url(u) and txt and u not in seen:
                hrefs.append((u, txt))
        if not hrefs and pno > 2:
            break
        for u, txt in hrefs:
            seen.add(u)
            if len(seen) > MAX_DETAILS:
                return
            try:
                visit(page, u, timeout=45000)
                page.wait_for_timeout(400)
                body = page.locator("body").inner_text()
                title = page_title(page, txt)
                ma = re.search(r"Author\s*:\s*([^\n]+)", body, re.I)
                status = "Completed" if re.search(r"\bCompleted\b", body, re.I) else ("Ongoing" if re.search(r"\bOngoing\b", body, re.I) else "")
                img = page.locator('meta[property="og:image"]').first.get_attribute("content") if page.locator('meta[property="og:image"]').count() else ""
                add("Wuxiaworld", title, u, clean(ma.group(1)) if ma else "", number(body), status, [], img or "")
            except Exception:
                add("Wuxiaworld", txt, u)


def merge_catalog(previous, incoming):
    """Preserva URL/identidade antiga, agrega fontes e conserva falhas parciais."""
    result = []
    for entry in [*previous, *incoming]:
        if not isinstance(entry, dict) or not novel_url(entry.get('url', '')):
            continue
        aliases = {norm(entry.get('title')), *[norm(s) for s in re.split(r'[,;]', entry.get('alternative', ''))]} - {''}
        match = next((x for x in result if x.get('url') == entry['url'] or
                      (norm(x.get('title')) in aliases and (novel_slug(x.get('url', '')) == novel_slug(entry['url']) or not x.get('author') or not entry.get('author') or norm(x.get('author')) == norm(entry.get('author'))))), None)
        if match is None:
            match = dict(entry)
            result.append(match)
        else:
            if match.get('metadata_pending') and not entry.get('metadata_pending') and entry.get('title_origin') != 'url':
                match['title'] = entry['title']
                match.pop('title_origin', None)
                match.pop('metadata_pending', None)
            for key, value in entry.items():
                if key not in ('url', 'source', 'sources', 'genres', 'title') and value not in (None, '', [], {}):
                    match[key] = value
            match['genres'] = sorted(set(match.get('genres', [])) | set(entry.get('genres', [])))
        sources = [*match.get('sources', []), *entry.get('sources', []), {'site': source_for(entry['url']), 'url': entry['url'], 'lang': 'EN'}]
        match['sources'] = list({s['url']: s for s in sources if novel_url(s.get('url', ''))}.values())
    return sorted(result, key=lambda x: x.get('title', '').casefold())


def check_link(url):
    at = datetime.now(timezone.utc).isoformat()
    if not domain_allowed(url) or not permitted(url):
        return {'status': 'unknown', 'at': at}
    try:
        time.sleep(REQUEST_DELAY)
        with urlopen(Request(url, method='HEAD', headers={'User-Agent': UA}), timeout=8) as response:
            return {'status': 'ok' if 200 <= response.status < 400 else 'unknown', 'at': at}
    except HTTPError as error:
        return {'status': 'broken' if error.code in (404, 410) else 'unknown', 'code': error.code, 'at': at}
    except Exception:
        return {'status': 'unknown', 'at': at}


def load_seeds():
    try:
        with open(os.path.join(os.path.dirname(__file__), 'catalog-seeds.json'), encoding='utf-8') as seed_file:
            return json.load(seed_file)
    except (FileNotFoundError, ValueError):
        return []


def build_catalog():
    from playwright.sync_api import sync_playwright
    items.clear()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1200},
            user_agent=UA,
        )
        for source, collect in [('NovelFull.com', lambda: scrape_novelfull(page, 'https://novelfull.com', 'NovelFull.com')),
                                ('NovelFull.net', lambda: scrape_novelfull(page, 'https://novelfull.net', 'NovelFull.net')),
                                ('Wuxiaworld', lambda: scrape_wuxia(page))]:
            before = len(items)
            try:
                collect()
                LOG.info('%s: %s registros coletados', source, len(items) - before)
            except Exception as error:
                LOG.warning('%s falhou; registros anteriores serão mantidos: %s', source, error)
        browser.close()

    # Kitsu enriquece os registros sem virar fonte de leitura.
    for item in items.values():
        # Reforço do filtro: nenhum link externo entra no catálogo.
        item["sources"] = [
            s for s in item.get("sources", [])
            if source_for(s.get("url", "")) in ALLOWED_DOMAINS
        ]
        item["source"] = source_for(item["url"])

    groups = {}
    for it in items.values():
        key = norm(it["title"]) + "|" + norm(it.get("author", ""))
        groups.setdefault(key, []).append(it)

    out = []
    for group in groups.values():
        main = dict(group[0])
        src = []
        for it in group:
            src.extend(it.get("sources", []))
            for field in ("author", "cover", "synopsis", "alternative", "year", "status"):
                if not main.get(field) and it.get(field):
                    main[field] = it[field]
            if (it.get("chapters") or 0) > (main.get("chapters") or 0):
                main["chapters"] = it["chapters"]
            if (it.get("rating") or 0) > (main.get("rating") or 0):
                main["rating"] = it["rating"]
            main["genres"] = sorted(set(main.get("genres", [])) | set(it.get("genres", [])))
        main["sources"] = list({(x["site"], x["url"]): x for x in src}.values())
        main["source"] = main["sources"][0]["site"] if main["sources"] else ""
        out.append(main)

    if not out:
        raise RuntimeError("Nenhuma fonte respondeu com obras válidas; catálogo anterior preservado.")
    try:
        with open(OUT, encoding="utf-8") as old_file:
            previous = json.load(old_file).get("items", [])
        out = merge_catalog(previous, [*out, *load_seeds()])
    except (FileNotFoundError, ValueError):
        pass
    out.sort(key=lambda x: x.get("title", "").lower())
    # Metadados faltantes primeiro: distribui o orçamento entre obras menos completas.
    for entry in sorted(out, key=lambda x: (bool(x.get('cover')), x.get('metadataCheckedAt', '')))[:METADATA_LIMIT]:
        apply_kitsu(entry)
        entry['metadataCheckedAt'] = datetime.now(timezone.utc).isoformat()
    check_limit = int(os.getenv('CATALOG_CHECK_LINKS', '20'))
    for entry in sorted(out, key=lambda x: x.get('linkCheck', {}).get('at', ''))[:check_limit]:
        entry['linkCheck'] = check_link(entry['url'])
    LOG.info('Catálogo mesclado: %s obras; nenhuma exclusão automática por falha de fonte', len(out))
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), "items": out}
    temporary = OUT + ".tmp"
    with open(temporary, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temporary, OUT)
    print("catalog entries:", len(out))
    print("allowed reading sources: NovelFull.com, NovelFull.net, Wuxiaworld")
    print("metadata source: Kitsu (auxiliary)")


def search_catalog(query):
    q = norm(query)
    results = []
    with open(OUT, encoding="utf-8") as f:
        data = json.load(f)
    for item in data.get("items", []):
        hay = " ".join([item.get("title", ""), item.get("alternative", ""), item.get("author", "")])
        if q in norm(hay):
            results.append(item)
    return results


def write_results(results, fmt, output=None):
    if fmt == "json":
        text = json.dumps(results, ensure_ascii=False, indent=2)
    else:
        lines = []
        for i, item in enumerate(results, 1):
            lines.append(
                f"{i}. {item.get('title')}\n"
                f"   Site: {item.get('source')}\n"
                f"   Link: {item.get('url')}\n"
                f"   Autor: {item.get('author') or '—'}\n"
                f"   Capítulos: {item.get('chapters') or '—'}\n"
                f"   Status: {item.get('status') or '—'}\n"
                f"   Kitsu: {'sim' if item.get('metadata_source') == 'Kitsu' else 'não'}"
            )
        text = "\n\n".join(lines) or "Nenhuma obra encontrada."

    if output:
        with open(output, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Salvo em: {output}")
    else:
        print(text)


def main():
    parser = argparse.ArgumentParser(description="Busca/cataloga WEB Novels com fontes controladas.")
    parser.add_argument("--query", "-q", help="Nome da novel para pesquisar no catálogo já gerado.")
    parser.add_argument("--format", "-f", choices=("json", "txt"), default="json", help="Formato da saída da busca.")
    parser.add_argument("--output", "-o", help="Arquivo de saída JSON/TXT.")
    parser.add_argument("--build", action="store_true", help="Reconstruir o catálogo antes da busca.")
    args = parser.parse_args()

    if args.build or not __import__("os").path.exists(OUT):
        build_catalog()
    if args.query:
        write_results(search_catalog(args.query), args.format, args.output)
        return

    if args.build or not sys.stdin.isatty():
        return

    # Modo interativo para uso direto no terminal.
    try:
        query = input("Nome da WEB Novel (Enter para sair): ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if not query:
        return
    results = search_catalog(query)
    print(f"\nEncontradas: {len(results)}")
    for i, item in enumerate(results, 1):
        print(f"{i}. {item.get('title')} — {item.get('source')} — {item.get('chapters') or '?'} capítulos")
        print(f"   {item.get('url')}")
    if not results:
        return
    try:
        choice = input("\nSalvar resultado em arquivo? [N]ão / [J]SON / [T]XT: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if choice.startswith("j"):
        write_results(results, "json", input("Nome do arquivo [resultados.json]: ").strip() or "resultados.json")
    elif choice.startswith("t"):
        write_results(results, "txt", input("Nome do arquivo [resultados.txt]: ").strip() or "resultados.txt")


if __name__ == "__main__":
    main()
