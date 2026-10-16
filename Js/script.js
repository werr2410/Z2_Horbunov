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

class Dish {
    // restaurant = { name, url }, day = 1–5, price = number or null
    constructor(restaurant, day, type, name, price, allergens = [], date) {
        this.restaurant = restaurant;
        this.day = day;
        this.type = type;
        this.name = name;
        this.price = price;
        this.allergens = allergens;
        this.date = date;
    }

    get priceText() {
        return this.price != null ? this.price.toFixed(2).replace('.', ',') + ' €' : '—';
    }

    getHTMLDish() {
        const info = TYPE_INFO[this.type];

        const photo = $('<div>', {
            class: 'dish-photo flex-shrink-0 d-flex align-items-center justify-content-center'
        }).append($('<span>', {
            role: 'img',
            'aria-label': info.label,
            text: info.emoji
        }));

        const restaurantBox = $('<div>', { class: 'overflow-hidden' }).append(
            $('<a>', {
                class: 'fw-semibold text-decoration-none d-block text-truncate',
                href: this.restaurant.url,
                target: '_blank',
                rel: 'noopener',
                text: this.restaurant.name
            }),
            $('<time>', {
                class: 'small',
                text: DAY_NAMES[this.day]
            })
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

const eat = { name: 'Eat & Meet', url: 'https://example.com' };

const dishes = [
    new Dish(eat, 1, TypeOfDish.SOUP, 'Kuracia polievka s rezancami', 2.5, [1, 3, 9], new Date()),
    new Dish(eat, 1, TypeOfDish.SALAD, 'Grécky šalát s fetou', 4.5, [7], new Date()),
    new Dish(eat, 1, TypeOfDish.SWEET, 'Palacinky s džemom', 3.2, [1, 3, 7], new Date()),
    new Dish(eat, 1, TypeOfDish.SOUP, 'Kuracia polievka s rezancami', 2.5, [1, 3, 9], new Date()),
    new Dish(eat, 1, TypeOfDish.MAIN, 'Kuracie prsia na grile, ryža', 6.9, [1, 7], new Date()),
    new Dish(eat, 1, TypeOfDish.SWEET, 'Palacinky s džemom', 3.2, [1, 3, 7], new Date()),
    new Dish(eat, 1, TypeOfDish.SOUP, 'Kuracia polievka s rezancami', 2.5, [1, 3, 9], new Date()),
    new Dish(eat, 1, TypeOfDish.MAIN, 'Kuracie prsia na grile, ryža', 6.9, [1, 7], new Date()),
    new Dish(eat, 1, TypeOfDish.SALAD, 'Grécky šalát s fetou', 4.5, [7], new Date()),
    new Dish(eat, 1, TypeOfDish.SWEET, 'Palacinky s džemom', 3.2, [1, 3, 7], new Date())
];

const $menu = $('#menu').empty();
dishes.forEach(d => $menu.append(d.getHTMLDish()));