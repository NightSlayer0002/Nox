// Public offer truth. Owner/developer access is not a subscription entitlement.
export const PRODUCT_OFFERS=Object.freeze({
  free:Object.freeze({id:'free',name:'NOX Free',status:'available',features:Object.freeze(['Expressive conversation','Explore questions and pasted passages','Playable stories and simple games','Approved preferences and explicitly kept activities on this device']),limits:'Text and natural voice have separate allowances. Availability and reset information are shown in the app.'}),
  plus:Object.freeze({id:'plus',name:'NOX Plus',status:'planned',purchasable:false,price:null,features:Object.freeze([]),description:'A possible future paid plan. Features, limits and pricing are not announced; no subscription or payment is available.'}),
});
