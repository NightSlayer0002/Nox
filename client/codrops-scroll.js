/*! Adapted from Codrops OnScrollTypographyAnimations src/js/index.js, effect 6.
 * Copyright (c) 2009-2022 Codrops. MIT license in /vendor/scroll-typography/LICENSE.
 * NOX changes: React-rendered accessible words/chars, scoped selectors,
 * earlier readable completion, and the existing shared GSAP/Lenis clock.
 */
export function sourceTypography(root,gsap){
  const titles=[...root.querySelectorAll('[data-effect6]')];
  for(const title of titles){
    const words=title.querySelectorAll('.word');
    for(const word of words){
      const chars=word.querySelectorAll('.char');
      chars.forEach(char=>gsap.set(char.parentNode,{perspective:2000}));
      gsap.fromTo(chars,{'will-change':'opacity, transform',opacity:0,rotationX:-90,yPercent:50},{
        ease:'power1.inOut',opacity:1,rotationX:0,yPercent:0,
        stagger:{each:.03,from:0},
        scrollTrigger:{trigger:word,start:'top 90%',end:'top 55%',scrub:.7},
      });
    }
  }
}
