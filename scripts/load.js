window.addEventListener('load', () => {
    // On any change to the load icon's attributes (classlist in this case), execute the observer's callback
    const loadObs = new MutationObserver((mutList, obs) => {
        adjustLoadLinePositions();
        randomizeLoadLines();
    });
    loadObs.observe(document.getElementById('load'), {
        childList: false,
        attributes: true
    });
});

function adjustLoadLinePositions() {
    const lines = document.getElementsByClassName('load__container');
    lines[0].style.setProperty('transform', 'translateX(-3vw)');
    lines[1].style.setProperty('transform', 'translateX(-3.25vw)');
    lines[2].style.setProperty('transform', 'translateX(-4.25vw)');
    lines[3].style.setProperty('transform', 'translateX(-3.5vw)');
    lines[4].style.setProperty('transform', 'translateX(0vw)');
    lines[5].style.setProperty('transform', 'translateX(0.5vw)');
}

function randomizeLoadLines() {
   const lines = document.getElementsByClassName('load__line');
   for (const l of lines) {
       // Randomize length of load lines
       const width = (Math.random() * 30) + 20;
       l.style.setProperty('--load-line-width', `${width}%`)

       // Randomize delay and speed for animation
       const delay = Math.random() * 5;
       const speed = (Math.random() * 3) + 1;
       l.style.setProperty('--load-line-delay', `${delay}s`);
       l.style.setProperty('--load-line-speed', `${speed}s`);
   } 
}