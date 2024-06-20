# Video-Group-Meeting

Videe-Group-Meeting is a simple video chat application for multi-users based on React, Node Express and WebRTC.

**Technologies Used**

- React
- Node + Express
- WebRTC
- Socket.io
- [Syled-components](https://styled-components.com/)
- [Simple-peer](https://github.com/feross/simple-peer)
- Server-deploy : ngrok, AWS

**Contributors:** [Hyunse Kim](https://github.com/Hyunse/video-group-meeting)

---

## Features

- Join a room
- Video Streaming
- Text chat
- Mute Video/Audio
- Screen Sharing

## Installation
### Clone
- Clone this repo to your local machine

### Setup
**Client**
> Move to client folder, update and install this package
<pre>
  <code>
    /* Install */
    cd client
    npm install
    
    /* Run */
    npm run start
  </code>
</pre>

**Server**
> Move to server folder, update and install this package
<pre>
  <code>
    /* Install */
    cd server
    npm install
    
    /* Run */
    npm run dev
  </code>
</pre>

**ngrok**
<pre>
  <code>
    /* Run */
    ngrok http 3000 --host-header="localhost:3000"
  </code>
</pre>

**Flask server**
> Flask server is deployed on AWS with EC2's ALB, Route53, ACM.

## Todo 🔨🔨🔨

- [x] 화상 플랫폼 구현
- [ ] 실시간 자막
- [x] Dialog 창
- [x] 실시간 회의록
- [ ] 실시간 워드 클라우드
- [x] 회의록 다운로드

## License
[MIT License](./LICENSE)
