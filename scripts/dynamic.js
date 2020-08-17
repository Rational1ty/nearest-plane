window.addEventListener('load', () => {
    // Randomize carousel images, set last image to be the same as the first, and start slideshow
    randomizeChildren('carousel');
    const c = $('carousel');
    c.appendChild(c.children[0].cloneNode(true));
    setTimeout(slide.bind(null, 1), 20_000);

    // Set onclick listeners for opening/closing popup
    $('open-instructions').addEventListener('click', show.bind(null, 'location-instructions'));     // Open link/button (the one that says "these steps")
    $('location-instructions').addEventListener('click', hide.bind(null, 'location-instructions')); // Area around popup box
    $('close-instructions').addEventListener('click', hide.bind(null, 'location-instructions'));    // "×" button in top-right of popup box

    // Set onclick listener for "Use current location" button
    $('use-location').addEventListener('click', fillLocation);

    // Set onclick listeners for next/previous arrow buttons under output box
    $('next').addEventListener('click', next.bind(null, 'output__box'));
    $('prev').addEventListener('click', prev.bind(null, 'output__box'));

    checkOutputButtons();

    for (const s of document.getElementsByClassName('output__box')) {
        if (!s.classList.contains('content--hidden')) continue;
        s.classList.add('output__box--right');
    }

    // Check if button visibility needs to be updated whenever dom changes occur
    const obs1 = new MutationObserver((mutationList, obs) => {
        checkOutputButtons();
    });
    obs1.observe($('out'), { 
        childList: true
    });
});

window.addEventListener('resize', () => {
    // Disable image transitions when resizing the page so they don't float around
    const images = document.getElementsByClassName('carousel__img');
    for (const img of images) {
        img.classList.remove('carousel__img--move');
    }
});

function $(id) {
    return document.getElementById(id);
}

function show(id) {
    $(id).classList.remove('content--hidden');
}

function hide(id) {
    $(id).classList.add('content--hidden');
}

// Randomizes the order of an element's direct children
function randomizeChildren(id) {
    const element = $(id);
    // Implementation of the Fisher-Yates shuffle
    for (let i = element.children.length; i > 0; i--) {
        let roll = Math.random() * i;
        let scratch = element.children[roll | 0];   // "roll | 0" is equivalant to calling "Math.floor(roll)", but executes faster
        element.appendChild(scratch);
    }
}

function checkOutputButtons() {
    const outputSlides = document.getElementsByClassName('output__box');
    if (outputSlides.length <= 1) {
        $('next').style.visibility = 'hidden';
        $('prev').style.visibility = 'hidden';
    } else {
        $('next').style.visibility = 'visible';
        $('prev').style.visibility = 'visible';

        let i = 0;
        for (const s of outputSlides) {
            if (!s.classList.contains('content--hidden')) break;
            i++;
        }

        $('prev').classList.remove('output__button--disabled');
        $('next').classList.remove('output__button--disabled');

        if (i === 0) {
            $('prev').classList.add('output__button--disabled');
            return;
        }
        if (i >= outputSlides.length - 1) {
            $('next').classList.add('output__button--disabled');
            return;
        }
    }
}

function next(className) {
    const slides = document.getElementsByClassName(className);

    // Find index of current slide
    let i = 0;
    for (const s of slides) {
        if (!s.classList.contains('content--hidden')) break;
        i++;
    }

    if (i >= slides.length - 1) return;

    slides[i].classList.add('output__box--left');

    setTimeout(() => {
        slides[i].classList.add('content--hidden');

        slides[i + 1].classList.remove('content--hidden');
        slides[i + 1].classList.remove('output__box--right');

        checkOutputButtons();
    }, 500);
}

function prev(className) {
    const slides = document.getElementsByClassName(className);

    // Find index of current slide
    let i = 0;
    for (const s of slides) {
        if (!s.classList.contains('content--hidden')) break;
        i++;
    }

    if (i === 0) return;

    slides[i].classList.add('output__box--right');

    setTimeout(() => {
        slides[i].classList.add('content--hidden');

        slides[i - 1].classList.remove('content--hidden');
        slides[i - 1].classList.remove('output__box--left');

        checkOutputButtons();
    }, 500);
}

// Background slideshow
function slide(num) {
    const images = document.getElementsByClassName('carousel__img');

    if (num >= images.length) {
        num = 0;
        for (const img of images) {
            img.classList.remove('carousel__img--move');
            img.style.left = '0';
        }
        setTimeout(slide.bind(null, num + 1), 0);
    } else {
        let dx = -100 * num;
        for (const img of images) {
            img.classList.add('carousel__img--move');
            img.style.left = `${dx}vw`;
        }
        setTimeout(slide.bind(null, num + 1), 20_000);
    }
}

// Enter the user's current location into the "coords" location field
function fillLocation() {
    const success = gp => {
        const lat = gp.coords.latitude;
        const long = gp.coords.longitude;
        $('coords').value = `${lat.toFixed(8)}, ${long.toFixed(8)}`;
    }

    const error = err => {
        console.error(err);
        alert('Geolocation is now disabled');
    }

    if (!navigator.geolocation) {
        console.log('Geolocation is not supported by this browser');
    } else {
        navigator.geolocation.getCurrentPosition(success, error);
    }
}