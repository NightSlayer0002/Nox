import {sanitizeInterfaceState} from '../../shared/interface-state.js';
export function observeInterface({stage={},floating,view,presence}={}){
  const activeScene=stage.scene?.action??'none',state=floating?.active?floating.state:null;
  return sanitizeInterfaceState({route:view,presence:floating?.active?'floating':presence,form:stage.form,activeScene,gravity:activeScene==='gravity',held:state?.dragging??stage.dragging,grounded:state?.grounded,lastAction:stage.lastAction});
}
