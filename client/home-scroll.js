// GSAP/Lenis integration from the cloned Codrops scroll demos. The transform
// targets are the existing R3F NOX icon and ShaderGradient world, not new art.
import {emblemPose,emblemChapter,finaleEmblemPose,playgroundShade} from '../public/js/home-choreography.js';

export function sourceWorldScroll(root,gsap,ScrollTrigger,pose,small,onChapter){
  const sections=[...root.querySelectorAll('.contact-chapter'),root.querySelector('.contact-details')];
  const markers=sections.map(section=>ScrollTrigger.create({trigger:section.querySelector('.contact-copy')||section,start:'center center',end:'bottom top',refreshPriority:-1}));
  const landmarks=()=>markers.map((marker,index)=>index===0?0:Math.max(0,marker.start));
  let anchors=landmarks();
  const resolvedPose=scroll=>{
    const next=emblemPose(scroll,anchors,small),room=root.querySelector('.cinematic-viewport');
    if(!room)return next;
    const rect=room.getBoundingClientRect();
    root.style.setProperty('--playground-shade',playgroundShade(rect,innerHeight).toFixed(4));
    const progress=Math.max(0,Math.min(1,(innerHeight-rect.top)/(innerHeight*.5)));
    const blend=progress*progress*(3-2*progress);
    if(blend>0){const finale=finaleEmblemPose(rect,{width:innerWidth,height:innerHeight},small);for(const key of Object.keys(finale))next[key]+=(finale[key]-next[key])*blend;}
    return next;
  };
  const movers=Object.fromEntries(Object.keys(pose).map(key=>[key,gsap.quickTo(pose,key,{duration:.22,ease:'power2.out'})]));
  ScrollTrigger.create({start:0,end:()=>ScrollTrigger.maxScroll(window),onUpdate:self=>{
    onChapter(emblemChapter(self.scroll()+innerHeight*.15,anchors));const next=resolvedPose(self.scroll());for(const key of Object.keys(next))movers[key](next[key]);
  },onRefresh:self=>{anchors=landmarks();onChapter(emblemChapter(self.scroll()+innerHeight*.15,anchors));const next=resolvedPose(self.scroll());gsap.set(pose,{...next});for(const key of Object.keys(next))movers[key](next[key]);}});
  for(const section of sections.slice(0,4)){
    const copy=section.querySelector('.contact-copy');
    gsap.fromTo(copy,{y:small?12:30},{y:small?-12:-35,ease:'none',scrollTrigger:{trigger:section,start:'top bottom',end:'bottom top',scrub:.8}});
    const margin=section.querySelector('.chapter-margin');if(margin)gsap.fromTo(margin,{y:60},{y:-40,ease:'none',scrollTrigger:{trigger:section,start:'top bottom',end:'bottom top',scrub:1}});
  }
  gsap.fromTo('.contact-water',{scale:1,rotation:0},{scale:1.1,rotation:small?0:5,ease:'none',scrollTrigger:{trigger:root,start:'top top',end:'bottom bottom',scrub:1}});
  gsap.from('.detail-columns article',{y:25,opacity:0,stagger:.12,duration:.6,ease:'power2.out',scrollTrigger:{trigger:'.detail-columns',start:'top 90%',toggleActions:'play none none reverse'}});
}
