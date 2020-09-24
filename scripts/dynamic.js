window.addEventListener('load', () => {
    // Randomize carousel images, set last image to be the same as the first, and start slideshow
    randomizeChildren('carousel');
    const c = $('carousel');
    c.appendChild(c.children[0].cloneNode(true));
    setTimeout(slide.bind(null, 1), 20_000);

    // Set onclick listeners for opening/closing popups
    $('open-instructions').addEventListener('click', show.bind(null, 'location-instructions'));     // Open link/button (the one that says "these steps")
	$('close-instructions').addEventListener('click', hide.bind(null, 'location-instructions'));    // "×" button in top-right of popup box
	$('close-raw').addEventListener('click', hide.bind(null, 'raw-popup'));	                        // "x" button for raw state popup

    // Set onclick listener for "Use current location" button
    $('use-location').addEventListener('click', fillLocation);

    // Set onclick listeners for next/previous arrow buttons under output box
    $('next').addEventListener('click', next.bind(null, 'output__box'));
    $('prev').addEventListener('click', prev.bind(null, 'output__box'));

    // Check if button visibility needs to be updated whenever dom changes occur
    const buttonObs = new MutationObserver(checkOutputButtons);
    buttonObs.observe($('out'), {
        childList: true
    });
});

// Disable image transitions when resizing the page so they don't float around
window.addEventListener('resize', () => {
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
        let scratch = element.children[roll | 0];   // "roll | 0" is the same as calling "Math.floor(roll)", but faster
        element.appendChild(scratch);
    }
}

function checkOutputButtons() {
    // Get buttons
    const pb = $('prev');
    const nb = $('next');

    // Check if buttons need to be visible
    const outputSlides = document.getElementsByClassName('output__box');
    if (outputSlides.length > 1) {
        pb.classList.remove('content--hidden');
        nb.classList.remove('content--hidden');
        $('slide-num').classList.remove('content--hidden');
    }

    // Find which slide is currently displayed
    let i = 0;
    for (const slide of outputSlides) {
        if (!slide.classList.contains('content--hidden')) break;
        i++;
    }

    $('slide-num').textContent = `${i + 1}/${outputSlides.length}`;
}

function next(className) {
    const slides = document.getElementsByClassName(className);

    // Find index of current slide
    let i = 0;
    for (const s of slides) {
        if (!s.classList.contains('content--hidden')) break;
        i++;
    }

    slides[i].classList.add('content--hidden');

    // If the last slide is currently displayed, wrap i to 0
    i = ++i >= slides.length ? 0 : i;

    slides[i].classList.remove('content--hidden');

    $('slide-num').textContent = `${i + 1}/${slides.length}`;
}

function prev(className) {
    const slides = document.getElementsByClassName(className);

    // Find index of current slide
    let i = 0;
    for (const s of slides) {
        if (!s.classList.contains('content--hidden')) break;
        i++;
    }

    slides[i].classList.add('content--hidden');

    // If the first slide is currently displayed, wrap i to slides.length - 1
    i = --i < 0 ? slides.length - 1 : i;
    
    slides[i].classList.remove('content--hidden');

    $('slide-num').textContent = `${i + 1}/${slides.length}`;
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