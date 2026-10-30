"use strict";

const TypeOfDish = Object.freeze({
    SOUP: 'soup',
    MAIN: 'main',
    SALAD: 'salad',
    SWEET: 'sweet'
});

const DAY_NAMES = Object.freeze({ 1: 'Pondelok', 2: 'Utorok', 3: 'Streda', 4: 'Štvrtok', 5: 'Piatok' });

const DAY_BY_NAME = Object.freeze({ pondelok: 1, utorok: 2, streda: 3, stvrtok: 4, piatok: 5 });

const ALLERGENS = Object.freeze({
    1: 'Obilniny',
    2: 'Kôrovce',
    3: 'Vajcia',
    4: 'Ryby',
    5: 'Arašidy',
    6: 'Sójové zrná',
    7: 'Mlieko',
    8: 'Orechy',
    9: 'Zeler',
    10: 'Horčica',
    11: 'Sezamové semená',
    12: 'Oxid siričitý',
    13: 'Vlčí bôb',
    14: 'Mäkkýše'
});

class SourceError extends Error {
    constructor(message) { super(message); this.name = 'SourceError'; }
}

class ParseError extends Error {
    constructor(message) { super(message); this.name = 'ParseError'; }
}

class Dish {
    constructor({ restaurant, day, type, name, price = null, allergens = [],
        date = null, photo = null, weight = null, vegetarian = false }) {
        this.restaurant = restaurant;
        this.day = day;
        this.type = type;
        this.name = name;
        this.price = price;
        this.allergens = allergens;
        this.date = date;
        this.photo = photo;
        this.weight = weight;
        this.vegetarian = vegetarian;
    }

    static fromJSON(o) {
        if (!o || typeof o !== 'object') return null;
        if (!o.restaurant || !o.restaurant.id) return null;
        if (!Object.values(TypeOfDish).includes(o.type) || !DAY_NAMES[o.day]) return null;
        if (typeof o.name !== 'string' || o.name === '') return null;

        return new Dish({
            restaurant: o.restaurant,
            day: o.day,
            type: o.type,
            name: o.name,
            price: typeof o.price === 'number' ? o.price : null,
            allergens: Array.isArray(o.allergens) ? o.allergens : [],
            date: o.date ?? null,
            photo: o.photo ?? null,
            weight: o.weight ?? null,
            vegetarian: o.vegetarian === true
        });
    }

    get priceText() {
        return this.price != null ? this.price.toFixed(2).replace('.', ',') + ' €' : '—';
    }

    get dateText() {
        if (!this.date) return '';
        const [, m, d] = this.date.split('-');
        return `${Number(d)}. ${Number(m)}.`;
    }
}

function cleanText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parsePrice(text) {
    const m = /(\d+(?:[.,]\d+)?)/.exec(String(text ?? ''));
    return m ? parseFloat(m[1].replace(',', '.')) : null;
}

function parseAllergens(text) {
    const nums = (String(text ?? '').match(/\d+/g) || [])
        .map(Number)
        .filter(n => ALLERGENS[n]);
    return [...new Set(nums)].sort((a, b) => a - b);
}

function absoluteUrl(src, base) {
    if (!src) return null;
    try {
        const u = new URL(src, base);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) {
        return null;
    }
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function dateForDay(day, ref = new Date()) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    d.setDate(d.getDate() - (d.getDay() + 6) % 7 + (day - 1));
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function restaurantRef(restaurant) {
    return { id: restaurant.id, name: restaurant.name, url: restaurant.url };
}

// "pondelok, 26.10.2026" aj "Pondelok 26.10.2026" -> { day: 1, date: "2026-10-26" }
function parseDayTitle(text) {
    const clean = cleanText(text);
    const day = DAY_BY_NAME[stripDiacritics(clean.split(/[\s,]+/)[0]).toLowerCase()] ?? 0;
    const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(clean);
    return { day, date: m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : null };
}

// odkrajuje od konca: (V), alergény ("A:1,3" alebo "(1,3)"), gramáž ("120g,100g", "0,3l")
function splitDishText(text, stripWeight = true) {
    let rest = cleanText(text);

    const vegetarian = /\(V\)$/.test(rest);
    if (vegetarian) rest = rest.replace(/\s*\(V\)$/, '');

    let allergens = [];
    const a = /\s*(?:A:\s*([\d,\s]*)|\(([\d,\s]+)\))$/.exec(rest);
    if (a) {
        allergens = parseAllergens(a[1] ?? a[2]);
        rest = rest.slice(0, a.index);
    }

    let weight = null;
    if (stripWeight) {
        const unit = '(?:kg|g|ml|l)';
        const num = '\\d+(?:[.,]\\d+)?';
        const w = new RegExp(`\\s+(${num}\\s?${unit}(?:\\s*,\\s*${num}\\s?${unit})*)$`).exec(rest);
        if (w) {
            weight = w[1].replace(/\s+/g, '');
            rest = rest.slice(0, w.index);
        }
    }

    return { name: cleanText(rest), weight, allergens, vegetarian };
}

/* Eat & Meet */

function eatAndMeetType(title) {
    const t = stripDiacritics(title).toLowerCase();
    if (t.startsWith('polievk')) return TypeOfDish.SOUP;
    if (t.startsWith('salat')) return TypeOfDish.SALAD;
    if (t.startsWith('sladk') || t.startsWith('mucn')) return TypeOfDish.SWEET;
    return TypeOfDish.MAIN;
}

function parseEatAndMeetItem($item, day, restaurant) {
    const title = cleanText($item.find('.menu-title h4').first().text());
    const $desc = $item.find('.menu-description .desc').first();
    const name = cleanText($desc.clone().find('span').remove().end().text());
    if (!name) return null;

    return new Dish({
        restaurant: restaurantRef(restaurant),
        day,
        type: eatAndMeetType(title),
        name,
        price: parsePrice($item.find('.menu-title .price').first().text()),
        allergens: parseAllergens($desc.find('span').text()),
        date: dateForDay(day),
        photo: absoluteUrl($item.find('.menu-thumbnail img').attr('src'), restaurant.liveUrl),
        vegetarian: stripDiacritics(title).toLowerCase().startsWith('vegetarian')
    });
}

function parseEatAndMeet(doc, restaurant) {
    const $panes = $(doc).find('.weak-menu > .tab-pane');
    if ($panes.length === 0) {
        throw new ParseError('Na stránke sa nenašlo týždenné menu (zmenila sa štruktúra stránky).');
    }

    const result = [];
    $panes.each((_, pane) => {
        const m = /^day-(\d)$/.exec(pane.id);
        const day = m ? Number(m[1]) : 0;
        if (day < 1 || day > 5) return;

        $(pane).find('.menu-body').each((__, body) => {
            try {
                const dish = parseEatAndMeetItem($(body), day, restaurant);
                if (dish) result.push(dish);
            } catch (e) {
                console.warn('Položku menu sa nepodarilo spracovať', e);
            }
        });
    });
    return result;
}

/* FreeFood (FiitFood, FaynFood): záložka podľa restaurant.paneId */

function parseFreeFoodItem($li, day, date, restaurant) {
    const label = cleanText($li.find('.brand').first().text());
    const price = parsePrice($li.find('.price').first().text());
    const parts = splitDishText($li.clone().find('.brand').remove().end().text());
    if (!parts.name) return null;

    return new Dish({
        restaurant: restaurantRef(restaurant),
        day,
        type: /^p/i.test(label) ? TypeOfDish.SOUP : TypeOfDish.MAIN,
        name: parts.name,
        price,
        allergens: parts.allergens,
        date: date ?? dateForDay(day),
        weight: parts.weight,
        vegetarian: parts.vegetarian
    });
}

function parseFreeFood(doc, restaurant) {
    const $pane = $(doc).find(`#${restaurant.paneId}`);
    if ($pane.length === 0) {
        throw new ParseError('Na stránke sa nenašla ponuka tejto prevádzky (zmenila sa štruktúra stránky).');
    }

    const $days = $pane.find('.daily-offer > li');
    if ($days.length === 0) {
        throw new ParseError('Na stránke sa nenašlo denné menu (zmenila sa štruktúra stránky).');
    }

    const result = [];
    $days.each((_, dayEl) => {
        const $day = $(dayEl);
        const { day, date } = parseDayTitle($day.find('.day-title').first().text());
        if (day < 1 || day > 5) return;

        const dishes = [];
        $day.find('.day-offer > li').each((__, li) => {
            try {
                const dish = parseFreeFoodItem($(li), day, date, restaurant);
                if (dish) dishes.push(dish);
            } catch (e) {
                console.warn('Položku menu sa nepodarilo spracovať', e);
            }
        });

        if (dishes.some(d => stripDiacritics(d.name).toLowerCase().startsWith('zatvoren'))) return;
        result.push(...dishes);
    });
    return result;
}

/* Jedáleň PriF UK (Delikanti): jedna tabuľka, riadok s <th> začína nový deň */

function parsePrifUk(doc, restaurant) {
    const $rows = $(doc).find('.prif-denne-table tr');
    if ($rows.length === 0) {
        throw new ParseError('Na stránke sa nenašla tabuľka denného menu (zmenila sa štruktúra stránky).');
    }

    const result = [];
    let current = null;

    $rows.each((_, tr) => {
        const $tr = $(tr);
        const $th = $tr.children('th');
        if ($th.length) current = parseDayTitle($th.text());
        if (!current || current.day < 1 || current.day > 5) return;

        const $cells = $tr.children('td');
        if ($cells.length < 2) return;

        try {
            const isSoup = cleanText($cells.eq(0).text()) === '';
            const parts = splitDishText($cells.eq(1).text(), isSoup);
            if (!parts.name) return;

            result.push(new Dish({
                restaurant: restaurantRef(restaurant),
                day: current.day,
                type: isSoup ? TypeOfDish.SOUP : TypeOfDish.MAIN,
                name: parts.name,
                price: parsePrice($cells.eq(2).text()),
                allergens: parts.allergens,
                date: current.date ?? dateForDay(current.day),
                weight: parts.weight
            }));
        } catch (e) {
            console.warn('Položku menu sa nepodarilo spracovať', e);
        }
    });
    return result;
}