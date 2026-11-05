// Independently authored for Hardleaf. Informed by HKMALA's append-only logs,
// semantic actions and links back to source events; no HKMALA code copied.
export class DecisionHistory {
  constructor(){this.sessionId=globalThis.crypto?.randomUUID?.()||`session-${Date.now()}`;this.events=[];this.head=null;this.branch='b1';this.branchCount=1;}
  append(action,state,details={}){
    const event={id:`e${this.events.length+1}`,sequence:this.events.length+1,at:new Date().toISOString(),sessionId:this.sessionId,actor:'human',action,branch:this.branch,parentStateEventId:this.head,previousChronologicalEventId:this.events.at(-1)?.id||null,state:structuredClone(state),rationale:null,uncertainty:null,candidatesConsidered:[],...structuredClone(details)};
    this.events.push(event);this.head=event.id;return event;
  }
  resume(id,reason=null){
    const source=this.events.find(e=>e.id===id);if(!source)throw Error('Unknown history state');
    const departed=this.head;this.branch=`b${++this.branchCount}`;this.head=source.id;
    const event=this.append('resume-and-branch',source.state,{restoredFromEventId:id,departedFromEventId:departed,rationale:reason||null});
    return structuredClone(event.state);
  }
  export(){return {schemaVersion:1,sessionId:this.sessionId,head:this.head,branch:this.branch,events:structuredClone(this.events)};}
}
