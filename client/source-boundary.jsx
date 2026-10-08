import React,{Component} from 'react';
// Kept outside the lazy scene chunk: a network failure must only replace the
// decorative effect, never unmount the navigation, NOX or primary action.
export class SourceBoundary extends Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?(this.props.fallback??<div className="source-fallback" aria-hidden="true"/>):this.props.children;}
}
