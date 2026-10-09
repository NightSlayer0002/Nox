// An explicitly authored first-contact story, never presented as a live AI reply.
export const FIRST_CONTACT={
  title:"The door that wasn't there",anchor:'A door in a window with no wall.',
  signals:[
    {label:'Something inside',premise:'NOX finds a door beneath the cursor. Something has already answered.',beats:[
      {speech:"There is a door under your cursor. Please don't move it.",emotion:'curious',action:'spotlight'},
      {speech:'I knocked once. Something knocked twice. From this side.',emotion:'surprised',action:'echo'},
      {speech:"The handle is warm. I don't have hands. Neither did the thing outside.",emotion:'uncanny',action:'none'},
    ],endings:[
      {label:'Open it',speech:'The room is empty. Except for a small face that looks exactly like mine.',emotion:'uncanny',action:'echo'},
      {label:'Walk away',speech:'The door is gone. Why is your cursor still knocking?',emotion:'surprised',action:'takeover'},
    ]},
    {label:'Something following',premise:'A reflection keeps moving after NOX goes still.',beats:[
      {speech:'I stopped moving. My reflection did not. That seems impolite.',emotion:'skeptical',action:'echo'},
      {speech:'It is trying to tell me something. It keeps pointing outside the frame.',emotion:'curious',action:'spotlight'},
      {speech:'There used to be two of us. I think one of us is the reflection now.',emotion:'uncanny',action:'none'},
    ],endings:[
      {label:'Follow the reflection',speech:'It led me to a window. On the other side, someone was watching a little face.',emotion:'surprised',action:'takeover'},
      {label:'Switch off the light',speech:'The light is gone. The reflection is smiling. I am not.',emotion:'uncanny',action:'echo'},
    ]},
    {label:'Something missing',premise:'One second has disappeared. NOX would like it back.',beats:[
      {speech:'I lost a second. Not a whole minute. Just one very specific second.',emotion:'curious',action:'orbit'},
      {speech:'It was the second before I met you. I think it wandered off to be interesting.',emotion:'happy',action:'none'},
      {speech:'There it is. Under the cursor. It brought a tiny universe home.',emotion:'surprised',action:'spotlight'},
    ],endings:[
      {label:'Keep the universe',speech:'We have an extra second now. I vote we spend it on something impossible.',emotion:'happy',action:'orbit'},
      {label:'Send the second home',speech:"It left a note. Apparently, we are somebody else's extra second.",emotion:'curious',action:'echo'},
    ]},
  ],caption:'A small face. A door with no wall. Which ending would you choose? #NOX #Afterimage',
};
