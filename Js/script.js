"use strict";

const LOCAL_STORAGE_REST = "REST_STORAGE";       
const LOCAL_STORAGE_UPDATE = "UPDATES_STORAGE";  
const LOCAL_STORAGE_SOURCE = "SOURCE_MODE";     

// Adresa proxy z cvičenia. URL reštaurácie sa pripojí na koniec (zakódovaná).
const PROXY_URL = "";
const REQUEST_TIMEOUT_MS = 10000;

const TypeOfDish = Object.freeze({
    SOUP: 'soup',
    MAIN: 'main',
    SALAD: 'salad',
    SWEET: 'sweet'
});

const TYPE_INFO = Object.freeze({
    [TypeOfDish.SOUP]: { label: 'Polievka', emoji: '🍲' },
    [TypeOfDish.MAIN]: { label: 'Hlavné jedlo', emoji: '🍗' },
    [TypeOfDish.SALAD]: { label: 'Šalát', emoji: '🥗' },
    [TypeOfDish.SWEET]: { label: 'Dezert', emoji: '🍰' }
});

// poradie typov pri zobrazení
const TYPE_ORDER = [TypeOfDish.SOUP, TypeOfDish.MAIN, TypeOfDish.SALAD, TypeOfDish.SWEET];

const DAY_NAMES = { 1: 'Pondelok', 2: 'Utorok', 3: 'Streda', 4: 'Štvrtok', 5: 'Piatok' };

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
    constructor(restaurant, day, type, name, price, allergens = [], date, photo = null) {
        this.restaurant = restaurant;
        this.day = day;
        this.type = type;
        this.name = name;
        this.price = price;
        this.allergens = allergens;
        this.date = date;
        this.photo = photo;
    }

    static fromJSON(o) {
        if (!o || typeof o !== 'object') return null;
        if (!o.restaurant || !o.restaurant.id || !TYPE_INFO[o.type] || !DAY_NAMES[o.day]) return null;
        if (typeof o.name !== 'string' || o.name === '') return null;

        return new Dish(
            o.restaurant,
            o.day,
            o.type,
            o.name,
            typeof o.price === 'number' ? o.price : null,
            Array.isArray(o.allergens) ? o.allergens : [],
            o.date ?? null,
            o.photo ?? null
        );
    }

    get priceText() {
        return this.price != null ? this.price.toFixed(2).replace('.', ',') + ' €' : '—';
    }

    get dateText() {
        if (!this.date) return '';
        const [, m, d] = this.date.split('-');
        return `${Number(d)}. ${Number(m)}.`;
    }

    getHTMLDish() {
        const info = TYPE_INFO[this.type];
        const makeEmoji = () => $('<span>', {
            role: 'img',
            'aria-label': info.label,
            text: info.emoji
        });

        const photo = $('<div>', {
            class: 'dish-photo flex-shrink-0 d-flex align-items-center justify-content-center'
        });

        if (this.photo) {
            photo.append(
                $('<img>', {
                    src: this.photo,
                    alt: this.name,
                    loading: 'lazy',
                    referrerpolicy: 'no-referrer'
                }).on('error', function () {
                    $(this).replaceWith(makeEmoji());
                })
            );
        } else {
            photo.append(makeEmoji());
        }

        const timeAttrs = {
            class: 'small',
            text: DAY_NAMES[this.day] + (this.date ? ' ' + this.dateText : '')
        };
        if (this.date) timeAttrs.datetime = this.date;

        const restaurantBox = $('<div>', { class: 'overflow-hidden' }).append(
            $('<a>', {
                class: 'fw-semibold text-decoration-none d-block text-truncate',
                href: this.restaurant.url,
                target: '_blank',
                rel: 'noopener',
                text: this.restaurant.name
            }),
            $('<time>', timeAttrs)
        );

        const header = $('<header>', {
            class: 'card-header d-flex align-items-center gap-3'
        }).append(photo, restaurantBox);

        const body = $('<div>', {
            class: 'card-body'
        }).append(
            $('<span>', {
                class: 'badge dish-type mb-2',
                text: info.label
            }),

            $('<div>', {
                class: 'd-flex justify-content-between align-items-start gap-2'
            }).append(
                $('<h3>', {
                    class: 'h6 mb-0 dish-name',
                    text: this.name
                }),
                $('<span>', {
                    class: 'dish-price',
                    text: this.priceText
                })
            )
        );

        const list = $('<ul>', { class: 'list-unstyled d-flex flex-wrap gap-1 mb-0' });
        if (this.allergens.length) {
            this.allergens.forEach(n => {
                list.append($('<li>').append(
                    $('<span>', {
                        class: 'badge rounded-pill dish-allergen',
                        title: ALLERGENS[n] ?? 'Alergén',
                        text: n
                    })
                ));
            });
        } else {
            list.append($('<li>', { class: 'small text-body-secondary', text: '—' }));
        }

        const footer = $('<footer>', {
            class: 'card-footer d-flex flex-row justify-content-between'
        }).append($('<div>', {
            class: 'small text-body-secondary mb-1',
            text: 'Alergény'
        })).append(list);

        return $('<article>', { class: `card dish-card dish-card--${this.type}` })
            .append(header, body, footer);
    }
}

function cleanText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// "4,80 € / 2,40 €" -> 4.8 
function parsePrice(text) {
    const m = /(\d+(?:[.,]\d+)?)/.exec(String(text ?? ''));
    return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// "(1,3,7)" -> [1, 3, 7]
function parseAllergens(text) {
    const nums = (String(text ?? '').match(/\d+/g) || [])
        .map(Number)
        .filter(n => ALLERGENS[n]);
    return [...new Set(nums)].sort((a, b) => a - b);
}

// future 
function absoluteUrl(src, base) {
    if (!src) return null;
    try {
        const u = new URL(src, base);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) {
        return null;
    }
}

function dateForDay(day, ref = new Date()) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const sinceMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - sinceMonday + (day - 1));
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function restaurantRef(restaurant) {
    return { id: restaurant.id, name: restaurant.name, url: restaurant.url };
}

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

    const allergens = parseAllergens($desc.find('span').text());
    const price = parsePrice($item.find('.menu-title .price').first().text());
    const photo = absoluteUrl($item.find('.menu-thumbnail img').attr('src'), restaurant.liveUrl);

    return new Dish(restaurantRef(restaurant), day, eatAndMeetType(title), name, price,
        allergens, dateForDay(day), photo);
}

function parseEatAndMeet(doc, restaurant) {
    const $panes = $(doc).find('.weak-menu > .tab-pane');
    if ($panes.length === 0) {
        throw new ParseError('Na stránke sa nenašlo týždenné menu (zmenila sa štruktúra stránky).');
    }

    const result = [];
    $panes.each(function () {
        const m = /^day-(\d)$/.exec(this.id);
        const day = m ? Number(m[1]) : 0;
        if (day < 1 || day > 5) return;  

        $(this).find('.menu-body').each(function () {
            try {
                const dish = parseEatAndMeetItem($(this), day, restaurant);
                if (dish) result.push(dish);
            } catch (e) {
                console.warn('Položku menu sa nepodarilo spracovať', e);  
            }
        });
    });
    return result;
}

const RESTAURANTS = [
    {
        id: 'eatandmeet',
        name: 'Eat & Meet',
        url: 'https://eatandmeet.sk/',                          
        liveUrl: 'https://eatandmeet.sk/',                      
        localUrl: 'TemplatePages/EatAndMeetDownloaded.html',  
        parse: parseEatAndMeet
    }
];

let dishes = [];          
let updates = {};         
let isLoading = false;
let loadFailed = false;  

function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { console.warn('localStorage', e); return false; }
}

function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { }
}

function SaveToLocalStorage() {
    const a = storageSet(LOCAL_STORAGE_REST, JSON.stringify(dishes));
    const b = storageSet(LOCAL_STORAGE_UPDATE, JSON.stringify(updates));
    return a && b;
}

function LoadFromLocalStorage() {
    dishes = [];
    updates = {};
    try {
        const rawDishes = JSON.parse(storageGet(LOCAL_STORAGE_REST));
        const rawUpdates = JSON.parse(storageGet(LOCAL_STORAGE_UPDATE));
        if (!Array.isArray(rawDishes) || !rawUpdates || typeof rawUpdates !== 'object') return false;

        dishes = rawDishes.map(o => Dish.fromJSON(o)).filter(Boolean);
        updates = rawUpdates;
        return dishes.length > 0;
    } catch (e) {
        console.warn('Poškodené dáta v localStorage, zmažem ich.', e);
        storageRemove(LOCAL_STORAGE_REST);
        storageRemove(LOCAL_STORAGE_UPDATE);
        dishes = [];
        updates = {};
        return false;
    }
}

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    return !isNaN(d) && d.toDateString() === new Date().toDateString();
}

function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return 'neznáme';
    return d.toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' });
}

function getSourceMode() {
    const saved = storageGet(LOCAL_STORAGE_SOURCE);
    if (saved === 'local' || saved === 'live') return saved;
    return PROXY_URL ? 'live' : 'local';
}

function getSourceUrl(restaurant) {
    if (getSourceMode() === 'local') return restaurant.localUrl;
    if (!PROXY_URL) throw new SourceError('Adresa proxy nie je nastavená (PROXY_URL v script.js).');
    return PROXY_URL + encodeURIComponent(restaurant.liveUrl);
}

function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        $.ajax({ url: url, method: 'GET', dataType: 'text', timeout: REQUEST_TIMEOUT_MS })
            .done(html => {
                if (!html || !html.trim()) reject(new SourceError('Stránka vrátila prázdnu odpoveď.'));
                else resolve(html);
            })
            .fail((xhr, status) => {
                const reason = status === 'timeout' ? 'vypršal časový limit'
                    : xhr.status ? `HTTP ${xhr.status}`
                        : 'stránka je nedostupná';
                reject(new SourceError(`Stránku sa nepodarilo načítať (${reason}).`));
            });
    });
}

async function loadRestaurant(restaurant) {
    const html = await fetchHtml(getSourceUrl(restaurant));
    const doc = new DOMParser().parseFromString(html, 'text/html');   
    const parsed = restaurant.parse(doc, restaurant);
    if (parsed.length === 0) throw new ParseError('Na stránke sa nenašli žiadne jedlá.');
    return parsed;
}

function errorMessage(err) {
    if (err instanceof SourceError || err instanceof ParseError) return err.message;
    return 'Neočakávaná chyba pri spracovaní stránky.';
}

async function ParseMenu(restaurants = RESTAURANTS) {
    if (isLoading) return;
    isLoading = true;
    setBusy(true);
    clearAlerts();
    showState('loading');

    const results = await Promise.allSettled(restaurants.map(r => loadRestaurant(r)));

    let failedCount = 0;
    results.forEach((res, i) => {
        const r = restaurants[i];
        if (res.status === 'fulfilled') {
            dishes = dishes.filter(d => d.restaurant.id !== r.id).concat(res.value);
            updates[r.id] = new Date().toISOString();
        } else {
            failedCount++;
            console.error(`[${r.name}]`, res.reason);
            let msg = `${r.name}: ${errorMessage(res.reason)}`;
            if (updates[r.id]) msg += ` Zobrazujem uložené údaje z ${formatDateTime(updates[r.id])}.`;
            showAlert('warning', msg);
        }
    });

    loadFailed = failedCount === restaurants.length && dishes.length === 0;

    if (failedCount < restaurants.length && !SaveToLocalStorage()) {
        showAlert('warning', 'Menu sa nepodarilo uložiť do prehliadača, pri ďalšom otvorení sa načíta znova.');
    }

    isLoading = false;
    setBusy(false);
    renderLastUpdates();
    render();
}

function ClearData() {
    if (isLoading) return;
    storageRemove(LOCAL_STORAGE_REST);
    storageRemove(LOCAL_STORAGE_UPDATE);
    dishes = [];
    updates = {};
    loadFailed = false;
    clearAlerts();
    renderLastUpdates();
    render();
    showAlert('info', 'Uložené dáta boli vymazané. Stlačte „Aktualizovať menu“ pre opätovné načítanie.');
}

function isWeekend() {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6;
}

function defaultDay() {
    return isWeekend() ? 1 : new Date().getDay();
}

function setDefaultDay() {
    $(`#day-${defaultDay()}`).prop('checked', true);
}

function buildRestaurantFilters() {
    const $box = $('#restaurantFilters').empty();
    RESTAURANTS.forEach(r => {
        $box.append(
            $('<input>', {
                type: 'checkbox', name: 'places', id: `r-${r.id}`, value: r.id,
                class: 'btn-check', autocomplete: 'off', checked: true
            }),
            $('<label>', { class: 'btn btn-outline-success btn-sm', for: `r-${r.id}`, text: r.name })
        );
    });
}

function getFilters() {
    const maxPrice = parseFloat($('#maxPrice').val());
    return {
        day: $('input[name="day"]:checked').val() || String(defaultDay()),   
        places: $('input[name="places"]:checked').map((_, el) => el.value).get(),
        type: $('input[name="t-type"]:checked').val() || 'all',
        maxPrice: isNaN(maxPrice) ? Infinity : maxPrice
    };
}

function resetFilters() {
    setDefaultDay();
    $('input[name="places"]').prop('checked', true);
    $('#t-all').prop('checked', true);
    $('#maxPrice').val($('#maxPrice').attr('max'));
    updatePriceOut();
    render();
}

function updatePriceOut() {
    $('#priceOut').text(String($('#maxPrice').val()).replace('.', ','));
}

function restaurantIndex(dish) {
    return RESTAURANTS.findIndex(r => r.id === dish.restaurant.id);
}

function formatCount(n) {
    if (n === 1) return '1 jedlo';
    if (n >= 2 && n <= 4) return `${n} jedlá`;
    return `${n} jedál`;
}

// 'loading' | 'list' | 'empty' | 'error' | 'none'
function showState(state) {
    $('#menuLoading').toggleClass('d-none', state !== 'loading');
    $('#dishList').toggleClass('d-none', state !== 'list');
    $('#menuEmpty').toggleClass('d-none', state !== 'empty');
    $('#menuError').toggleClass('d-none', state !== 'error');
    if (state !== 'list') {
        $('#dishList').empty();
        $('#menuCount').addClass('d-none');
    }
}

function render() {
    if (isLoading) return;

    if (dishes.length === 0) {
        showState(loadFailed ? 'error' : 'none');
        return;
    }

    const f = getFilters();
    const days = f.day === 'all' ? [1, 2, 3, 4, 5] : [Number(f.day)];
    const items = [];
    let shown = 0;

    days.forEach(day => {
        const ofDay = dishes.filter(d => d.day === day && f.places.includes(d.restaurant.id));

        const matching = ofDay
            .filter(d => f.type === 'all' || d.type === f.type)
            .filter(d => d.price == null || d.price <= f.maxPrice)
            .sort((a, b) => restaurantIndex(a) - restaurantIndex(b)
                || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

        const missing = RESTAURANTS.filter(r =>
            f.places.includes(r.id) && !ofDay.some(d => d.restaurant.id === r.id));

        if (matching.length === 0 && missing.length === 0) return;

        if (f.day === 'all') {
            items.push($('<h3>', { class: 'w-100 h4 text-center mt-3 mb-0', text: DAY_NAMES[day] }));
        }
        missing.forEach(r => items.push($('<div>', {
            class: 'alert alert-secondary w-100 text-center mb-0',
            role: 'status',
            text: `${r.name}: Menu na tento deň nie je k dispozícii.`
        })));
        matching.forEach(d => items.push(d.getHTMLDish()));
        shown += matching.length;
    });

    if (items.length === 0) {
        showState('empty');
        return;
    }

    $('#dishList').empty().append(items);
    showState('list');
    $('#menuCount').text(formatCount(shown)).removeClass('d-none');
}

function renderLastUpdates() {
    const $list = $('#lastUpdate').empty();
    RESTAURANTS.forEach(r => {
        const when = updates[r.id] ? formatDateTime(updates[r.id]) : 'zatiaľ nenačítané';
        $list.append($('<li>', { text: `${r.name}: ${when}` }));
    });
}

function showAlert(type, message, tag = 'fetch') {
    $('<div>', {
        class: `alert alert-${type} alert-dismissible fade show`,
        role: 'alert',
        'data-tag': tag
    }).append(
        $('<span>', { text: message }),
        $('<button>', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'alert', 'aria-label': 'Zavrieť' })
    ).appendTo('#menuAlerts');
}

function clearAlerts(tag = 'fetch') {
    $(`#menuAlerts [data-tag="${tag}"]`).remove();
}

function setBusy(on) {
    $('#updateBtn, #clearDataBtn, #retryBtn').prop('disabled', on);
    $('#updateBtn').text(on ? 'Načítavam…' : 'Aktualizovať menu');
}

function bindEvents() {
    $('#filters')
        .on('submit', e => e.preventDefault())
        .on('change', 'input[name="day"], input[name="places"], input[name="t-type"]', render)
        .on('input', '#maxPrice', function () {
            updatePriceOut();
            render();
        });

    $('#resetFiltersBtn, #clearFiltersBtn').on('click', resetFilters);

    $('#updateBtn, #updateBtnNav').on('click', function (e) {
        e.preventDefault();
        ParseMenu(RESTAURANTS);
    });
    $('#retryBtn').on('click', () => ParseMenu(RESTAURANTS));
    $('#clearDataBtn').on('click', ClearData);

    $('#sourceLocal')
        .prop('checked', getSourceMode() === 'local')
        .on('change', function () {
            storageSet(LOCAL_STORAGE_SOURCE, this.checked ? 'local' : 'live');
            ParseMenu(RESTAURANTS);
        });
}

async function Init() {
    const loaded = LoadFromLocalStorage();
    const stale = RESTAURANTS.filter(r => !loaded || !isToday(updates[r.id]));

    renderLastUpdates();
    if (stale.length > 0) await ParseMenu(stale);
    else render();

    if (isWeekend()) {
        showAlert('info', 'Cez víkend menu nie je k dispozícii, zobrazujeme pondelok.', 'weekend');
    }
}

$(document).ready(function () {
    buildRestaurantFilters();
    setDefaultDay();
    updatePriceOut();
    bindEvents();
    Init();
});