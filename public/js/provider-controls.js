// One selection shared by the native composer and Preferences controls.
export function createProviderControls(selects,onChange,createOption=()=>document.createElement('option')){
  let selected='',choices=[];
  const sync=value=>{selected=value;for(const select of selects)select.value=value;};
  const changed=event=>{
    const value=event.currentTarget.value;
    if(!choices.some(choice=>choice.id===value&&!choice.disabled)){sync(selected);return;}
    sync(value);onChange(value);
  };
  for(const select of selects)select.addEventListener('change',changed);
  return {
    update(next,value){
      choices=next;
      for(const select of selects){select.disabled=false;select.replaceChildren(...choices.map(choice=>{
        const option=createOption();option.value=choice.id;option.textContent=choice.name;option.disabled=!!choice.disabled;
        if(choice.model)option.title=`Configured base model: ${choice.model}`;
        return option;
      }));}
      sync(value);
    },
    dispose(){for(const select of selects)select.removeEventListener('change',changed);}
  };
}
