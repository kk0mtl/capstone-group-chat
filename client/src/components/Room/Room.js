import React, { useState, useEffect, useRef } from "react";
import Peer from "simple-peer";
import styled from "styled-components";
import socket from "../../socket";
import STT from "stt.js";
import VideoCard from "../Video/VideoCard";
import BottomBar from "../BottomBar/BottomBar";
import Chat from "../Chat/Chat";
import Dialog from "../Dialog/Dialog";
import { useHistory } from 'react-router-dom';

const Room = (props) => {
  const currentUser = sessionStorage.getItem("user");
  const [peers, setPeers] = useState([]);
  const [userVideoAudio, setUserVideoAudio] = useState({
    localUser: { video: true, audio: true },
  });
  const [videoDevices, setVideoDevices] = useState([]);
  const [screenShare, setScreenShare] = useState(false);
  const [showVideoDevices, setShowVideoDevices] = useState(false);
  const peersRef = useRef([]);
  const userVideoRef = useRef();
  const screenTrackRef = useRef();
  const userStream = useRef();
  const roomId = props.match.params.roomId;
  const stt = useRef(null);

  useEffect(() => {
    const currentUser = sessionStorage.getItem("user") || props.currentUser;  // 새로고침 시 사용자 정보를 세션 스토리지에서 가져옵니다.
    const savedRoomId = sessionStorage.getItem("roomId");  // 방 정보도 세션 스토리지에서 가져옵니다.

    // 세션 스토리지에 방 ID와 사용자 정보를 저장 (최초 실행 시)
    sessionStorage.setItem("roomId", roomId);
    sessionStorage.setItem("user", currentUser);

    // 비디오 장치 가져오기
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const filtered = devices.filter((device) => device.kind === "videoinput");
      setVideoDevices(filtered);
    });

    // 유저 미디어 가져오기 및 STT 설정
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        userVideoRef.current.srcObject = stream;
        userStream.current = stream;

        stt.current = new STT({
          continuous: true,
          interimResults: true,
        });

        stt.current.on("result", handleSTTResult);

        stt.current.on("error", (error) => {
          console.log("error :>> ", error);
          switch (error) {
            case "not-allowed":
              alert("마이크 권한이 필요합니다.");
              break;
            default:
              console.log(error);
          }
        });

        // 오디오 트랙이 활성화되어 있는 경우 STT 시작
        if (userStream.current.getAudioTracks()[0] && userStream.current.getAudioTracks()[0].enabled) {
          startSTT();
        }

        // 새로고침 시 세션 스토리지에 저장된 정보를 이용해 자동 재연결
        if (savedRoomId) {
          socket.emit("BE-join-room", { roomId: savedRoomId, userName: currentUser });
        } else {
          socket.emit("BE-join-room", { roomId, userName: currentUser });
        }

        // 방에 참여한 사용자 정보를 받아 처리
        socket.on("FE-user-join", (users) => {
          const peers = [];

          users.forEach(({ userId, info }) => {

            console.log("Currently connected peers:");
            peersRef.current.forEach(({ peerID, userName, peer }) => {
              console.log(`Username: ${userName}, Peer Object:`, peer);
            });

            let { userName, video, audio } = info;

            if (userName !== currentUser) {
              const peer = createPeer(userId, socket.id, stream);
              peer.userName = userName;
              peer.peerID = userId;

              peersRef.current.push({
                peerID: userId,
                peer,
                userName,
              });
              peers.push(peer);

              setUserVideoAudio((preList) => {
                return {
                  ...preList,
                  [peer.userName]: { video, audio },
                };
              });
            }
          });
          setPeers(peers);
        });

        // 호출을 수신했을 때 처리
        socket.on("FE-receive-call", ({ signal, from, info }) => {
          let { userName, video, audio } = info;
          const peerIdx = findPeer(from);

          if (!peerIdx) {
            const peer = addPeer(signal, from, stream);

            peer.userName = userName;

            peersRef.current.push({
              peerID: from,
              peer,
              userName: userName,
            });
            setPeers((users) => {
              return [...users, peer];
            });
            setUserVideoAudio((preList) => {
              return {
                ...preList,
                [peer.userName]: { video, audio },
              };
            });
          }
        });

        // 호출 수락 처리
        socket.on("FE-call-accepted", ({ signal, answerId }) => {
          const peerIdx = findPeer(answerId);
          peerIdx.peer.signal(signal);
        });

        // 사용자가 방을 떠날 때 처리
        socket.on("FE-user-leave", ({ userId, userName }) => {
          const peerIdx = findPeer(userId);
          peerIdx.peer.destroy();
          setPeers((users) => {
            users = users.filter((user) => user.peerID !== peerIdx.peer.peerID);
            return [...users];
          });
          peersRef.current = peersRef.current.filter(
            ({ peerID }) => peerID !== userId
          );
        });

      });

    return () => {
      cleanUpPeers();
      socket.disconnect(); // 소켓 연결 해제
      stopSTT(); // STT 리소스 정리
    };
  }, [roomId, props.currentUser]); // roomId와 props.currentUser가 변경될 때마다 실행

  const cleanUpPeers = () => {
    peersRef.current.forEach(({ peer }) => {
      peer.destroy(); // Peer 연결 해제
    });
    peersRef.current = []; // Peer 목록 초기화

    // 로컬 스트림 정리
    if (userStream.current) {
      userStream.current.getTracks().forEach(track => track.stop());
    }
    setPeers([]); // 화면에 표시된 Peer 초기화
  };

  function createPeer(userId, caller, stream) {
    const existingPeer = findPeer(userId);
    if (existingPeer) {
      existingPeer.peer.destroy(); // 기존 Peer가 있으면 제거
      peersRef.current = peersRef.current.filter(({ peerID }) => peerID !== userId);
    }

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("BE-call-user", {
        userToCall: userId,
        from: caller,
        signal,
      });
    });

    return peer;
  }

  function addPeer(incomingSignal, callerId, stream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("BE-accept-call", { signal, to: callerId });
    });

    peer.signal(incomingSignal);

    return peer;
  }

  function findPeer(id) {
    return peersRef.current.find((p) => p.peerID === id);
  }

  function createUserVideo(peer, index, arr) {
    return (
      <VideoBox
        className={`width-peer${peers.length > 8 ? "" : peers.length}`}
        onClick={expandScreen}
        key={index}
      >
        {writeUserName(peer.userName)}
        <FaIcon className="fas fa-expand" />
        <VideoCard key={index} peer={peer} number={arr.length} />
      </VideoBox>
    );
  }

  function writeUserName(userName, index) {
    if (userVideoAudio.hasOwnProperty(userName)) {
      if (!userVideoAudio[userName].video) {
        return <OffUserName key={userName}>{userName}</OffUserName>;
      } else {
        return <OnUserName key={userName}>{userName}</OnUserName>
      }
    }
  }

  //After
  const history = useHistory();

  const handleStop = () => {
    socket.emit("BE-leave-room", { roomId, leaver: currentUser });

    if (userStream.current) {
      userStream.current.getTracks().forEach(track => track.stop());
    }

    peersRef.current.forEach(({ peer }) => {
      peer.destroy();
    });
    setPeers([]); // peers 상태 초기화

    // 세션 스토리지에서 방 정보 삭제
    sessionStorage.removeItem("roomId");
    sessionStorage.removeItem("user");

    history.push(`/result/${roomId}`);
  };

  const [finalScript, setFinalScript] = useState("");
  const [previousFinalScript, setPreviousFinalScript] = useState("");
  const [interimScript, setInterimScript] = useState("");

  const handleSTTResult = ({ finalTranscript, interimTranscript }) => {
    setInterimScript(interimTranscript);
    setFinalScript(finalTranscript);
  };

  useEffect(() => {
    if (finalScript !== "" && finalScript !== previousFinalScript) {
      socket.emit("BE-stt-data-out", {
        roomId,
        sender: currentUser,
        msg: finalScript,
        prev: previousFinalScript,
        timestamp: new Date().toISOString(),
      });
      setPreviousFinalScript(finalScript);
      setFinalScript("");
    }
  }, [finalScript, currentUser, roomId]);

  const startSTT = () => {
    if (stt.current && !stt.current.getIsRecognizing()) {
      try {
        stt.current.start();
      } catch (error) {
        console.log("Error starting STT: ", error);
      }
    }
  };

  const stopSTT = () => {
    if (stt.current && stt.current.getIsRecognizing()) {
      try {
        stt.current.stop();
      } catch (error) {
        console.log("Error stopping STT: ", error);
      }
    }
  };

  const toggleCameraAudio = (e) => {
    const target = e.target.getAttribute("data-switch");
    if (userVideoRef.current && userVideoRef.current.srcObject) {
      let videoSwitch = userVideoAudio["localUser"].video;
      let audioSwitch = userVideoAudio["localUser"].audio;

      if (target === "video" && userVideoRef.current.srcObject.getVideoTracks().length > 0) {
        const userVideoTrack = userVideoRef.current.srcObject.getVideoTracks()[0];
        videoSwitch = !videoSwitch;
        userVideoTrack.enabled = videoSwitch;
      } else if (target === "audio" && userVideoRef.current.srcObject.getAudioTracks().length > 0) {
        const userAudioTrack = userVideoRef.current.srcObject.getAudioTracks()[0];
        audioSwitch = !audioSwitch;
        userAudioTrack.enabled = audioSwitch;
      }

      if (audioSwitch) {
        startSTT();
      } else {
        stopSTT();
      }

      setUserVideoAudio((preList) => {
        return {
          ...preList,
          localUser: { video: videoSwitch, audio: audioSwitch },
        };
      });
    }
    socket.emit("BE-toggle-camera-audio", { roomId, switchTarget: target });
  };

  const clickScreenSharing = () => {
    if (!screenShare) {
      navigator.mediaDevices
        .getDisplayMedia({ cursor: true })
        .then((stream) => {
          const screenTrack = stream.getTracks()[0];

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
            peer.replaceTrack(
              peer.streams[0]
                .getTracks()
                .find((track) => track.kind === "video"),
              screenTrack,
              userStream.current
            );
          });

          // Listen click end
          screenTrack.onended = () => {
            peersRef.current.forEach(({ peer }) => {
              peer.replaceTrack(
                screenTrack,
                peer.streams[0]
                  .getTracks()
                  .find((track) => track.kind === "video"),
                userStream.current
              );
            });
            userVideoRef.current.srcObject = userStream.current;
            setScreenShare(false);
          };

          userVideoRef.current.srcObject = stream;
          screenTrackRef.current = screenTrack;
          setScreenShare(true);
        });
    } else {
      screenTrackRef.current.onended();
    }
  };

  const expandScreen = (e) => {
    const elem = e.target;

    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      /* Firefox */
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      /* Chrome, Safari & Opera */
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      /* IE/Edge */
      elem.msRequestFullscreen();
    }
  };

  const clickBackground = () => {
    if (!showVideoDevices) return;

    setShowVideoDevices(false);
  };

  const clickCameraDevice = (event) => {
    if (
      event &&
      event.target &&
      event.target.dataset &&
      event.target.dataset.value
    ) {
      const deviceId = event.target.dataset.value;
      const enabledAudio =
        userVideoRef.current.srcObject.getAudioTracks()[0].enabled;

      navigator.mediaDevices
        .getUserMedia({ video: { deviceId }, audio: enabledAudio })
        .then((stream) => {
          const newStreamTrack = stream
            .getTracks()
            .find((track) => track.kind === "video");
          const oldStreamTrack = userStream.current
            .getTracks()
            .find((track) => track.kind === "video");

          userStream.current.removeTrack(oldStreamTrack);
          userStream.current.addTrack(newStreamTrack);

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
            peer.replaceTrack(
              oldStreamTrack,
              newStreamTrack,
              userStream.current
            );
          });
        });
    }
  };

  const interimScriptRef = useRef(null);

  // Font size 조절 함수 정의
  const increaseFontSize = () => {
    // interimScriptRef가 유효한지 확인
    if (interimScriptRef.current) {
      const currentFontSize = parseFloat(
        window.getComputedStyle(interimScriptRef.current).fontSize
      );
      // font-size 증가
      interimScriptRef.current.style.fontSize = `${currentFontSize + 1}px`;
    }
  };

  const decreaseFontSize = () => {
    // interimScriptRef가 유효한지 확인
    if (interimScriptRef.current) {
      const currentFontSize = parseFloat(
        window.getComputedStyle(interimScriptRef.current).fontSize
      );
      // font-size 감소
      interimScriptRef.current.style.fontSize = `${currentFontSize - 1}px`;
    }
  };

  const resetFontSize = () => {
    if (interimScriptRef.current) {
      interimScriptRef.current.style.fontSize = ""; // 기본값으로 설정
    }
  };

  return (
    <RoomContainer onClick={clickBackground}>
      <VideoAndChatContainer>
        <Dialog
          display={true}
          finalTranscript={finalScript}
          sender={currentUser}
        />
        <VideoContainer>
          {/* Current User Video */}
          <VideoBox
            className={`width-peer${peers.length > 8 ? "" : peers.length}`}
          >
            {userVideoAudio["localUser"].video ? (
              <OnUserName>{currentUser}</OnUserName>
            ) : (
              <OffUserName>{currentUser}</OffUserName>
            )}
            <FaIcon className="fas fa-expand" />
            <MyVideo
              onClick={expandScreen}
              ref={userVideoRef}
              muted
              autoPlay
              playInline
            ></MyVideo>
          </VideoBox>
          {/* Joined User Vidoe */}
          {peers &&
            peers.map((peer, index, arr) => createUserVideo(peer, index, arr))}
          {
            <SmallTitle>
              <strong>{currentUser}</strong>
              <p ref={interimScriptRef}>{interimScript}</p>
            </SmallTitle>
          }
        </VideoContainer>
        <Chat roomId={roomId} display={true} />
      </VideoAndChatContainer>

      <BottomBar
        clickScreenSharing={clickScreenSharing}
        clickCameraDevice={clickCameraDevice}
        goToBack={handleStop}
        toggleCameraAudio={toggleCameraAudio}
        userVideoAudio={userVideoAudio["localUser"]}
        screenShare={screenShare}
        videoDevices={videoDevices}
        showVideoDevices={showVideoDevices}
        setShowVideoDevices={setShowVideoDevices}
        increaseFontSize={increaseFontSize}
        decreaseFontSize={decreaseFontSize}
        resetFontSize={resetFontSize}
      />
    </RoomContainer>
  );
};

const RoomContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(to bottom, black, white);
`;

const VideoAndChatContainer = styled.div`
  display: flex;
  flex: 1;
  width: 88%;
  height: 83vh;
  background-color: white;
  margin: 0px 80px 95px;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
`;

const VideoContainer = styled.div`
  display: flex;
  position: relative;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  max-width: 100%;
  width: 65%;
  height: 100%;
  padding: 5px;
  gap: 5px;
  box-sizing: border-box;
  gap: 10px;
`;

const MyVideo = styled.video``;

const VideoBox = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  > video {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 10px;
  }

  :hover {
    > i {
      display: block;
    }
  }
`;

const SmallTitle = styled.div`
  width: 90%;
  opacity: 0.8;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: gray;
  color: #d7d7d7;
  margin-top: 15px;
  padding: 8px;
  gap: 20px;
  text-align: right;
  font-family: "NunitoMedium";
  font-size: 16px;

  > p {
    max-width: 80%;
    width: auto;
    color: #d7d7d7;
    font-size: 15px;
    text-align: left;
    font-family: "NunitoMedium";
  }
`;

const OnUserName = styled.div`
  position: absolute;
  bottom: 2px;
  left: 15px;
  font-size: 28px;
  z-index: 1;
  opacity: 0.9;
  font-family: "NunitoMedium";
`;

const OffUserName = styled.div`
  position: absolute;
  font-size: calc(20px + 5vmin);
  z-index: 1;
  font-family: "NunitoExtraBold";
`;

const FaIcon = styled.i`
  display: none;
  position: absolute;
  right: 15px;
  top: 15px;
`;

export default Room;
