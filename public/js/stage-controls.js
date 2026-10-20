// Physical play changes the stage, never the conversation or playback clock.
export function connectStageControls(stage,{sceneButtons=[],formButtons=[],expressionControls=[],sceneLabel,labels={},onAction,onFormChange}={}){
  const owned=stage.events?{signal:stage.events.signal}:{};
  stage.onScene=action=>{
    if(sceneLabel)sceneLabel.textContent=action==='none'&&stage.form==='core'?'Click to send a wave. Hold and pull.':labels[action]||'';
    for(const button of sceneButtons){const active=button.dataset.scene===action;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
  };
  for(const button of sceneButtons)button.addEventListener('click',()=>{
    if(stage.stopScene(button.dataset.scene))return;
    stage.run(button.dataset.scene);onAction?.();
  },owned);
  for(const button of formButtons)button.addEventListener('click',()=>{
    stage.setForm(button.dataset.form);
    for(const control of formButtons)control.setAttribute('aria-pressed',String(control.dataset.form===stage.form));
    for(const control of expressionControls)control.disabled=stage.form==='core';
    onFormChange?.(stage.form);
  },owned);
  for(const control of expressionControls)control.addEventListener('change',()=>{
    if(stage.form!=='core'&&control.value)stage.character.preview?.(control.value,stage.time);
  },owned);
}
