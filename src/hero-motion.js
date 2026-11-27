const video = document.getElementById('hero-video');
const art = document.getElementById('hero-art');
const control = document.getElementById('hero-motion');
const motion = matchMedia('(min-width: 600px) and (prefers-reduced-motion: no-preference)');
let inView = false;
let pausedByUser = false;

function updateControl() {
  const action = video.paused ? 'Play' : 'Pause';
  control.textContent = action;
  control.setAttribute('aria-label', action + ' crystal animation');
}

function canPlay() {
  return motion.matches && inView && !document.hidden && !pausedByUser;
}

function updatePlayback() {
  if (!motion.matches) {
    video.pause();
    delete art.dataset.video;
    control.hidden = true;
    return;
  }
  if (!canPlay()) {
    video.pause();
    return;
  }
  if (!video.hasAttribute('src')) video.src = video.dataset.src;
  video.play().catch(error => {
    if (error.name === 'NotAllowedError' && canPlay()) {
      pausedByUser = true;
      updateControl();
      control.hidden = false;
    }
  });
}

video.addEventListener('playing', () => {
  if (!canPlay()) {
    video.pause();
    return;
  }
  art.dataset.video = 'visible';
  control.hidden = false;
  updateControl();
});
video.addEventListener('pause', updateControl);
video.addEventListener('error', () => {
  delete art.dataset.video;
  control.hidden = true;
});
control.addEventListener('click', () => {
  pausedByUser = !video.paused;
  updatePlayback();
});
motion.addEventListener('change', updatePlayback);
document.addEventListener('visibilitychange', updatePlayback);
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  updatePlayback();
}, { threshold: .2 }).observe(art);
