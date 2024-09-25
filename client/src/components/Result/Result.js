import styled from "styled-components";
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../../socket';
import { renderToString } from 'react-dom/server';

const Result = (props) => {
    const { roomId } = useParams(); // roomId 추출

    const [summaryData, setSummaryData] = useState({
        fullSummary: '',
        currentDate: '',
        topicResponse: ''
    });

    const [wordCloudImage, setWordCloudImage] = useState(null);
    const shostIP = 'capstonesmugroupchat.click/gpt';   //summary
    const whostIP = 'capstonesmugroupchat.click./wc';  //wordcloud

    useEffect(() => {
        // fetch summary data
        fetch(`https://${shostIP}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
        })
            .then(response => {
                console.log("Received response from /wc/summarize:", response);
                return response.json();
            })
            .then(data => {
                setSummaryData({
                    fullSummary: data.full_summary,
                    currentDate: data.current_date,
                    topicResponse: data.topic_response,
                });
            })
            .catch(error => {
                console.error('회의 요약을 가져오는 중 오류가 발생했습니다:', error);
            });

        // WordCloud 이미지 가져오기
        fecthWordCloudImage();

        // socket
        socket.on('FE-click-pop', ({ error }) => {
            if (!error) {
                console.log("Result clicked");
            } else {
                console.log("result error");
            }
        });
    }, [roomId]); // roomId를 의존성 배열에 추가

    // wordcloud 이미지 가져오기
    const fecthWordCloudImage = async () => {
        try {
            const response = await fetch(`https://${whostIP}/generate_wordcloud`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    //'ngrok-skip-browser-warning': '69420'
                },
                body: JSON.stringify({
                    document_id: 1
                })
            });

            if (response.ok) {
                const data = await response.json();
                const imageId = data.image_id;
                console.log(data, imageId);
                fetchImage(imageId);
            } else {
                throw new Error('워드 클라우드 생성 중 오류 발생');
            }
        } catch (error) {
            console.error('워드 클라우드 생성 중 오류 발생 : ', error);
        }
    };

    // 이미지 가져오기
    const fetchImage = async (imageId) => {
        try {
            const response = await fetch(`https://${whostIP}/get_image/${imageId}`);

            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const base64Image = arrayBufferToBase64(arrayBuffer);
                setWordCloudImage(`data:image/png;base64,${base64Image}`);

            } else {
                throw new Error('이미지를 가져오는 데 실패했습니다.');
            }
        } catch (error) {
            console.error('이미지를 가져오는 데 실패했습니다: ', error);
        }
    }

    const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    const { fullSummary, currentDate, topicResponse } = summaryData;
    console.log(fullSummary);

    function formatTextWithLineBreaks(text) {
        return text.split('-').map(part => part.trim()).filter(part => part).join('\n- ');
    }

    // React -> html
    const convertComponentToHtml = (wordCloudImage, topicResponse, currentDate, fullSummary) => {
        return `
        <div style="color: black;">
            ${wordCloudImage && `<img src="${wordCloudImage}" alt="Word Cloud" style="width: 50%; height: auto;" />`}
            <h1>회의 요약</h1>
            <div>
                <h2>주제</h2>
                <p>${topicResponse}</p>
            </div>
            <div>
                <h2>진행 날짜</h2>
                <p>${currentDate}</p>
            </div>
            <div>
                <h2>회의 내용 요약</h2>
                <pre>
                    ${formatTextWithLineBreaks(fullSummary)}
                </pre>
            </div>
        </div>
    `;
    };

    // pdf 변환
    const handleDownloadPDF = async () => {
        try {
            // React 컴포넌트를 정적 HTML로 렌더링
            const htmlContent = convertComponentToHtml(wordCloudImage, topicResponse, currentDate, fullSummary);
            console.log(">> ", wordCloudImage);

            // HTML을 Flask 서버로 전송하여 PDF로 변환 요청
            const response = await fetch(`https://${shostIP}/result/${roomId}/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ htmlContent: htmlContent })
            });

            // PDF 다운로드 링크 생성
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'meeting_summary.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error('PDF 변환 중 오류 발생:', error);
        }
    };

    return (
        <Body>
            <div
                style={{
                    color: "black",
                    width: "100vw",
                    height: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                }}
            >

                {wordCloudImage && (
                    <img
                        src={wordCloudImage}
                        alt="Word Cloud"
                        style={{
                            width: "40%",
                            height: "auto",
                            display: "block",
                            marginLeft: "10px",
                        }}
                    />
                )}
                <Summary>

                    <h1>회의 요약</h1>
                    <div>
                        <h2>주제</h2>
                        <p style={{ width: "70%", margin: "0 auto" }}>{topicResponse}</p>

                    </div>
                    <div>
                        <h2>진행 날짜</h2>
                        <p>{currentDate}</p>
                    </div>
                    <div>
                        <h2>회의 내용 요약</h2>
                        <p style={{ width: "70%", margin: "0 auto" }}>{fullSummary}</p>

                    </div>
                    <PdfButton>

                        <button onClick={handleDownloadPDF}>PDF Download</button>
                    </PdfButton>
                </Summary>

            </div>
        </Body>
    );
};

const Body = styled.div`
        background-color: white;
        font-family: "NunitoMedium";
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        margin-Left: "30px",
        `;

const Summary = styled.div`
        width: 60%;
        font-size:16px;
        `;

const PdfButton = styled.div`
        > button {
        position: relative;
        display: inline-block;
        cursor: pointer;
        outline: none;
        border: 0;
        vertical-align: middle;
        text-decoration: none;
        font-size: 18px;
        font-family: inherit;
        
        font-weight: 600;
        color: #382b22;
        text-transform: uppercase;
        margin-top: 40px;
        padding: 0.9em 0.8em;
        background: #fff0f0;
        border: 2px solid #b18597;
        border-radius: 0.75em;
        transform-style: preserve-3d;
        transition: transform 150ms cubic-bezier(0, 0, 0.58, 1),
        background 150ms cubic-bezier(0, 0, 0.58, 1);
        
        :before {
        position: absolute;
        content: "";
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #f9c4d2;
        border-radius: inherit;
        box-shadow: 0 0 0 2px #b18597, 0 0.625em 0 0 #ffe3e2;
        transform: translate3d(0, 0.75em, -1em);
        transition: transform 150ms cubic-bezier(0, 0, 0.58, 1),
        box-shadow 150ms cubic-bezier(0, 0, 0.58, 1);
        }
        :hover {
        background: #ffe9e9;
        transform: translate(0, 0.25em);
        :before {
        box-shadow: 0 0 0 2px #b18597, 0 0.5em 0 0 #ffe3e2;
        transform: translate3d(0, 0.5em, -1em);
        }
        }
        :active {
        background: #ffe9e9;
        transform: translate(0em, 0.75em);
        :before {
        box-shadow: 0 0 0 2px #b18597, 0 0 #ffe3e2;
        transform: translate3d(0, 0, -1em);
        }
        }
        }
        `;

export
    default Result;
