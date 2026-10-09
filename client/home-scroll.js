// GSAP/Lenis integration from the cloned Codrops scroll demos. The transform
// targets are the existing R3F NOX icon and ShaderGradient world, not new art.
import {emblemPose,emblemChapter} from '../public/js/home-choreography.js';

export function sourceWorldScroll(root,gsap,ScrollTrigger,pose,small,onChapter){
  const sections=[...root.querySelectorAll('.contact-chapter'),root.querySelector('.contact-details')];
  const markers=sections.map(section=>ScrollTrigger.create({trigger:section,start:'top top',end:'bottom top'}));
  let anchors=markers.map(marker=>marker.start);
  const movers=Object.fromEntries(Object.keys(pose).map(key=>[key,gsap.quickTo(pose,key,{duration:.36,ease:'power2.out'})]));
  ScrollTrigger.create({start:0,end:()=>ScrollTrigger.maxScroll(window),onUpdate:self=>{
    onChapter(emblemChapter(self.scroll()+innerHeight*.35,anchors));const next=emblemPose(self.scroll(),anchors,small);for(const key of Object.keys(next))movers[key](next[key]);
  },onRefresh:self=>{anchors=markers.map(marker=>marker.start);onChapter(emblemChapter(self.scroll()+innerHeight*.35,anchors));gsap.set(pose,emblemPose(self.scroll(),anchors,small));}});
  for(const section of sections.slice(0,4)){
    const copy=section.querySelector('.contact-copy');
    gsap.fromTo(copy,{y:small?12:30},{y:small?-12:-35,ease:'none',scrollTrigger:{trigger:section,start:'top bottom',end:'bottom top',scrub:.8}});
    const margin=section.querySelector('.chapter-margin');if(margin)gsap.fromTo(margin,{y:60},{y:-40,ease:'none',scrollTrigger:{trigger:section,start:'top bottom',end:'bottom top',scrub:1}});
  }
  gsap.fromTo('.contact-water',{scale:1,rotation:0},{scale:1.1,rotation:small?0:5,ease:'none',scrollTrigger:{trigger:root,start:'top top',end:'bottom bottom',scrub:1}});
  gsap.from('.detail-columns article',{y:25,opacity:0,stagger:.12,duration:.6,ease:'power2.out',scrollTrigger:{trigger:'.detail-columns',start:'top 90%',toggleActions:'play none none reverse'}});
}
