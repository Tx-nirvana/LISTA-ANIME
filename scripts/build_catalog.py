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
from datetime import datetime, timezone
from urllib.parse import quote, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from playwright.sync_api import sync_playwright

OUT = "novels-catalog.json"
ALLOWED_DOMAINS = {
    "novelfull.com": "NovelFull.com",
    "novelfull.net": "NovelFull.net",
    "wuxiaworld.com": "Wuxiaworld",
}
UA = "Mozilla/5.0 (compatible; OtakuLibraryCatalog/2.0; +https://github.com/Tx-nirvana/LISTA-ANIME)"
items = {}


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def domain_allowed(url):
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        return host in ALLOWED_DOMAINS
    except Exception:
        return False


def source_for(url):
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        return ALLOWED_DOMAINS.get(host, "")
    except Exception:
        return ""


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
    if not title or not url or source != source_for(url):
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
    try:
        with urlopen(req, timeout=timeout) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError):
        return None


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", clean(value).lower())


def kitsu_enrich(title):
    """Kitsu é apenas auxiliar: nunca cria link de leitura fora dos 3 domínios."""
    if not title:
        return {}
    endpoint = (
        "https://kitsu.io/api/edge/manga"
        "?filter[subtype]=novel"
        "&page[limit]=10"
        "&filter[text]=" + quote(title)
    )
    data = http_json(endpoint)
    if not data:
        return {}
    wanted = norm(title)
    best = None
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
            elif wanted and (wanted in n or n in wanted):
                score = max(score, 70)
        if score > best_score:
            best_score, best = score, a
    if not best or best_score < 70:
        return {}
    cover = (best.get("coverImage") or {}).get("large") or (best.get("coverImage") or {}).get("original") or ""
    status_map = {
        "current": "Ongoing",
        "finished": "Completed",
        "tba": "Not Yet Released",
        "unreleased": "Not Yet Released",
        "upcoming": "Not Yet Released",
    }
    genres = []
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


def scrape_novelfull(page, base, source, max_pages=80):
    seen = set()
    roots = [base + "/novel-list", base + "/completed-novel", base + "/"]
    for root in roots:
        for pno in range(1, max_pages + 1):
            url = root if pno == 1 else root + "?page=" + str(pno)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(400)
            except Exception:
                continue
            found = 0
            for a in page.locator("a[href]").all():
                try:
                    href = a.get_attribute("href") or ""
                    txt = clean(a.inner_text())
                except Exception:
                    continue
                u = safe_url(href, base)
                if not u or source_for(u) != source:
                    continue
                path = urlparse(u).path.lower()
                if not re.search(r"/[^/]+\.html$", path) or "chapter" in path:
                    continue
                if not txt or len(txt) < 2 or len(txt) > 180 or u in seen:
                    continue
                seen.add(u)
                found += 1
                try:
                    page.goto(u, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(200)
                    body = clean(page.locator("body").inner_text())
                    title = clean(page.locator("h1").first.inner_text() if page.locator("h1").count() else txt)
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


def scrape_wuxia(page, max_pages=40):
    base = "https://www.wuxiaworld.com"
    seen = set()
    for pno in range(1, max_pages + 1):
        url = base + "/novels" if pno == 1 else base + "/novels?page=" + str(pno)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(700)
        except Exception:
            continue
        hrefs = []
        for a in page.locator('a[href*="/novel/"]').all():
            try:
                href = a.get_attribute("href") or ""
                txt = clean(a.inner_text())
            except Exception:
                continue
            u = safe_url(href, base)
            if u and txt and u not in seen:
                hrefs.append((u, txt))
        if not hrefs and pno > 2:
            break
        for u, txt in hrefs:
            seen.add(u)
            try:
                page.goto(u, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(400)
                body = clean(page.locator("body").inner_text())
                title = clean(page.locator("h1").first.inner_text() if page.locator("h1").count() else txt)
                ma = re.search(r"Author\s*:\s*([^\n]+)", body, re.I)
                status = "Completed" if re.search(r"\bCompleted\b", body, re.I) else ("Ongoing" if re.search(r"\bOngoing\b", body, re.I) else "")
                img = page.locator('meta[property="og:image"]').first.get_attribute("content") if page.locator('meta[property="og:image"]').count() else ""
                add("Wuxiaworld", title, u, clean(ma.group(1)) if ma else "", number(body), status, [], img or "")
            except Exception:
                add("Wuxiaworld", txt, u)


def build_catalog():
    items.clear()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1200},
            user_agent=UA,
        )
        scrape_novelfull(page, "https://novelfull.com", "NovelFull.com")
        scrape_novelfull(page, "https://novelfull.net", "NovelFull.net")
        scrape_wuxia(page)
        browser.close()

    # Kitsu enriquece os registros sem virar fonte de leitura.
    for item in items.values():
        apply_kitsu(item)
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

    out.sort(key=lambda x: x.get("title", "").lower())
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), "items": out}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
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
    if not args.build:
        print("Catálogo pronto. Use --query \"nome\" para pesquisar ou --build para atualizar.")


if __name__ == "__main__":
    main()
