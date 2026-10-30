"use strict";

const LOCAL_STORAGE_REST = "REST_STORAGE";
const LOCAL_STORAGE_UPDATE = "UPDATES_STORAGE";
const LOCAL_STORAGE_SOURCE = "SOURCE_MODE";

const PROXY_URL = "";
const REQUEST_TIMEOUT_MS = 10000;

const TYPE_INFO = Object.freeze({
    [TypeOfDish.SOUP]: { label: 'Polievka', emoji: '🍲' },
    [TypeOfDish.MAIN]: { label: 'Hlavné jedlo', emoji: '🍗' },
    [TypeOfDish.SALAD]: { label: 'Šalát', emoji: '🥗' },
    [TypeOfDish.SWEET]: { label: 'Dezert', emoji: '🍰' }
});

const TYPE_ORDER = [TypeOfDish.SOUP, TypeOfDish.MAIN, TypeOfDish.SALAD, TypeOfDish.SWEET];

const RESTAURANTS = [
    {
        id: 'eatandmeet',
        name: 'Eat & Meet',
        url: 'https://eatandmeet.sk/',
        liveUrl: 'https://eatandmeet.sk/',
        localUrl: 'TemplatePages/EatAndMeetDownloaded.html',
        parse: parseEatAndMeet
    },
    {
        id: 'fiitfood',
        name: 'FiitFood',
        url: 'http://www.freefood.sk/menu/',
        liveUrl: 'http://www.freefood.sk/menu/',
        localUrl: 'TemplatePages/FIITFOOD.html',
        paneId: 'fiit-food',
        parse: parseFreeFood
    },
    {
        id: 'prifuk',
        name: 'Jedáleň PriF UK',
        url: 'https://www.delikanti.sk/',
        liveUrl: 'https://www.delikanti.sk/',
        localUrl: 'TemplatePages/PriFUK.html',
        parse: parsePrifUk
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

        dishes = rawDishes
            .map(o => Dish.fromJSON(o))
            .filter(d => d && RESTAURANTS.some(r => r.id === d.restaurant.id));
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

async function loadRestaurant(restaurant, pageCache) {
    const url = getSourceUrl(restaurant);
    if (!pageCache.has(url)) pageCache.set(url, fetchHtml(url));

    const html = await pageCache.get(url);
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

    const pageCache = new Map();
    const results = await Promise.allSettled(restaurants.map(r => loadRestaurant(r, pageCache)));

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

function renderDishCard(dish) {
    const info = TYPE_INFO[dish.type];
    const makeEmoji = () => $('<span>', { role: 'img', 'aria-label': info.label, text: info.emoji });

    const photo = $('<div>', {
        class: 'dish-photo flex-shrink-0 d-flex align-items-center justify-content-center'
    });

    if (dish.photo) {
        photo.append(
            $('<img>', {
                src: dish.photo,
                alt: dish.name,
                loading: 'lazy',
                referrerpolicy: 'no-referrer'
            }).on('error', function () {
                $(this).replaceWith(makeEmoji());
            })
        );
    } else {
        photo.append(makeEmoji());
    }

    const dayText = DAY_NAMES[dish.day] + (dish.date ? ' ' + dish.dateText : '');

    const restaurantBox = $('<div>', { class: 'overflow-hidden' }).append(
        $('<a>', {
            class: 'fw-semibold text-decoration-none d-block text-truncate',
            href: dish.restaurant.url,
            target: '_blank',
            rel: 'noopener',
            text: dish.restaurant.name
        }),
        dish.date
            ? $('<time>', { class: 'small', datetime: dish.date, text: dayText })
            : $('<span>', { class: 'small', text: dayText })
    );

    const header = $('<header>', {
        class: 'card-header d-flex align-items-center gap-3'
    }).append(photo, restaurantBox);

    const badges = $('<div>', { class: 'mb-2' }).append(
        $('<span>', { class: 'badge dish-type', text: info.label })
    );
    if (dish.vegetarian) {
        badges.append($('<span>', { class: 'badge text-bg-success ms-1', text: 'Vegetariánske' }));
    }

    const body = $('<div>', { class: 'card-body' }).append(
        badges,
        $('<div>', {
            class: 'd-flex justify-content-between align-items-start gap-2'
        }).append(
            $('<h3>', { class: 'h6 mb-0 dish-name', text: dish.name }),
            $('<span>', { class: 'dish-price', text: dish.priceText })
        )
    );
    if (dish.weight) {
        body.append($('<div>', { class: 'small text-body-secondary mt-1', text: dish.weight }));
    }

    const list = $('<ul>', { class: 'list-unstyled d-flex flex-wrap gap-1 mb-0' });
    if (dish.allergens.length) {
        dish.allergens.forEach(n => {
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

    return $('<article>', { class: `card dish-card dish-card--${dish.type}` })
        .append(header, body, footer);
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
    return {
        day: $('input[name="day"]:checked').val() || String(defaultDay()),
        places: $('input[name="places"]:checked').map((_, el) => el.value).get(),
        types: $('input[name="t-type"]:checked').map((_, el) => el.value).get()
    };
}

function resetFilters() {
    setDefaultDay();
    $('input[name="places"]').prop('checked', true);
    $('input[name="t-type"]').prop('checked', false);
    render();
}

function restaurantIndex(dish) {
    return RESTAURANTS.findIndex(r => r.id === dish.restaurant.id);
}

function formatCount(n) {
    if (n === 1) return '1 jedlo';
    if (n >= 2 && n <= 4) return `${n} jedlá`;
    return `${n} jedál`;
}

function showState(state) {
    $('#menuNoData').toggleClass('d-none', state !== 'nodata');
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
        showState(loadFailed ? 'error' : 'nodata');
        return;
    }

    const f = getFilters();
    const days = f.day === 'all' ? [1, 2, 3, 4, 5] : [Number(f.day)];
    const items = [];
    let shown = 0;

    days.forEach(day => {
        const ofDay = dishes.filter(d => d.day === day && f.places.includes(d.restaurant.id));

        const matching = ofDay
            .filter(d => f.types.length === 0 || f.types.includes(d.type))
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
        matching.forEach(d => items.push(renderDishCard(d)));
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

function timeElement(iso) {
    return $('<time>', { datetime: iso, text: formatDateTime(iso) });
}

function renderLastUpdates() {
    const known = RESTAURANTS
        .map(r => ({ name: r.name, date: new Date(updates[r.id]) }))
        .filter(x => !isNaN(x.date));
    const $box = $('#lastUpdate').empty().removeAttr('title');

    if (known.length === 0) {
        $box.text('—');
    } else {
        const oldest = known.reduce((a, b) => (a.date <= b.date ? a : b)).date;
        $box
            .append(timeElement(oldest.toISOString()))
            .attr('title', known.map(x => `${x.name}: ${formatDateTime(x.date.toISOString())}`).join('\n'));
    }

    RESTAURANTS.forEach(r => {
        const $t = $(`[data-last-update="${r.id}"]`).empty();
        const iso = updates[r.id];
        if (iso && !isNaN(new Date(iso))) {
            $t.append(timeElement(iso));
        } else {
            $t.text('zatiaľ nenačítané');
        }
    });
}

function clearStoredData() {
    if (isLoading) return;
    if (!window.confirm('Naozaj chcete vymazať menu uložené v tomto prehliadači?')) return;

    storageRemove(LOCAL_STORAGE_REST);
    storageRemove(LOCAL_STORAGE_UPDATE);
    dishes = [];
    updates = {};
    loadFailed = false;
    clearAlerts();
    renderLastUpdates();
    render();
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
    $('#updateBtn, #retryBtn, #loadBtn, #clearDataBtn').prop('disabled', on);
    $('#updateBtn').text(on ? 'Načítavam…' : 'Aktualizovať menu');
}

function bindNavigation() {
    const panel = document.getElementById('offcanvasNavbar');

    $('#offcanvasNavbar .nav-link').on('click', function (e) {
        const $target = $(this.hash);
        if (!$target.length) return;
        e.preventDefault();

        $('#offcanvasNavbar .nav-link').removeClass('active');
        $(this).addClass('active');

        const scrollToTarget = () => $target[0].scrollIntoView({ behavior: 'smooth' });
        if (window.bootstrap && panel.classList.contains('show')) {
            panel.addEventListener('hidden.bs.offcanvas', scrollToTarget, { once: true });
            bootstrap.Offcanvas.getInstance(panel).hide();
        } else {
            scrollToTarget();
        }
    });
}

function bindEvents() {
    $('#filters')
        .on('submit', e => e.preventDefault())
        .on('change', 'input[name="day"], input[name="places"], input[name="t-type"]', render);

    $('#resetFiltersBtn, #clearFiltersBtn').on('click', resetFilters);

    $('#updateBtn, #updateBtnNav').on('click', function (e) {
        e.preventDefault();
        ParseMenu(RESTAURANTS);
    });
    $('#retryBtn, #loadBtn').on('click', () => ParseMenu(RESTAURANTS));
    $('#clearDataBtn').on('click', clearStoredData);

    $('#sourceLocal')
        .prop('checked', getSourceMode() === 'local')
        .on('change', function () {
            storageSet(LOCAL_STORAGE_SOURCE, this.checked ? 'local' : 'live');
            ParseMenu(RESTAURANTS);
        });

    bindNavigation();
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
    bindEvents();
    Init();
});