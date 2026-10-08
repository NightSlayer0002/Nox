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

/*! Codrops src/js/index2.js, effect 26. Original pinned scrub timeline and
 * alternating character origins; shorter NOX dwell and early text completion.
 * On touch layouts the source effect-6 entrance preserves native scrolling.
 */
export function sourcePinnedTypography(root,gsap,small){
  const title=root.querySelector('[data-effect26]');if(!title)return;
  if(small){
    gsap.fromTo(title.querySelectorAll('.char'),{opacity:0,rotationX:-90,yPercent:50},{opacity:1,rotationX:0,yPercent:0,ease:'power1.inOut',stagger:.015,scrollTrigger:{trigger:title,start:'top 90%',end:'top 60%',scrub:.7}});return;
  }
  const chapter=title.closest('.contact-chapter');
  const timeline=gsap.timeline({scrollTrigger:{trigger:chapter,start:'top top',end:'+=55%',scrub:.7,pin:chapter,pinSpacing:true,refreshPriority:1,invalidateOnRefresh:true}});
  [...title.querySelectorAll('.word')].forEach((word,index)=>timeline.fromTo(word.querySelectorAll('.char'),{'will-change':'transform',transformOrigin:index%2?'50% 100%':'50% 0%',scaleY:.82},{ease:'power1.inOut',scaleY:1,duration:.4,stagger:{amount:.18,from:'center'}},0));
  timeline.to({}, {duration:.45});
}
