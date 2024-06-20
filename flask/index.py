from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from pymongo import MongoClient
from pdfkit.configuration import Configuration
import datetime
import pdfkit
import requests
import json
import sys
import os
from openai import OpenAI

app = Flask(__name__)
CORS(app)

load_dotenv()

# MongoDB 연결
client = MongoClient('mongodb+srv://njeon671:7mvEjoODB3B40U1J@cluster0.kjw1zru.mongodb.net/')
db = client['test']
collection = db['datas']

# 아래에 OpenAI API 키 추가
#
#

@app.route('/')
def index():
    return "Hello Flask"

# GPT 번역
@app.route('/translate', methods=['POST'])
def translate_text():
    try:
        data = request.json
        text = data.get('text', '')

        response = gpt.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "Translate the following text to English"},
                {"role": "user", "content": text},
            ]
        )
        print(response)
        translated_text = response.choices[0].message.content.strip()
        return jsonify({'translated_text': translated_text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

def format_time_range(start_time, end_time):
    start_str = start_time.strftime('%Y/%m/%d : %H시 %M분')
    end_str = end_time.strftime('%Y/%m/%d : %H시 %M분')
    return f"{start_str} ~ {end_str}"

# 분할
@app.route('/summarize', methods=['POST'])
def summarize_script():
    # MongoDB에서 모든 문서 가져오기
    documents = collection.find()

    first_document = collection.find_one()
    if first_document:
        first_time = first_document.get('timestamp')
    else:
        first_time = None

    # 사용자 이름과 메시지를 저장할 리스트 생성
    script = []

    # 각 문서에서 사용자 이름과 메시지 추출하여 형식에 맞게 저장
    for document in documents:
        username = document.get('userName')
        sttmsg = document.get('sttMsg')
        script.append({"username": username, "sttmsg": sttmsg})

    # 스크립트를 1000자씩 분리
    parts = [script[i:i+1000] for i in range(0, len(script), 1000)]
    summaries = []

    for part in parts:
        # 파트를 문자열로 변환
        part_content = "\n".join([f"{item['username']}: {item['sttmsg']}" for item in part])

        response = gpt.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": part_content},
                {"role": "assistant",
                 "content": "1. I want a summary of the meeting\n"
                            "2. The summary result should be bullet form\n"
                            "3. You must have to write it in Korean\n"
                            "4. The summary results should be in chronological order\n"
                            "5. Include Key points discussed\n"
                            "6. Include Important decisions made\n"
                            "7. Include Action items assigned\n"
                            "8. Do not mention or refer to the script or instructions in the summary."
                            }
            ]
        )

        # 결과 저장
        summary = response.choices[0].message.content
        summaries.append(summary)

    # 결합
    full_summary = ' '.join(summaries)

    # 전체 주제
    topic_response = gpt.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": full_summary},
            {"role": "assistant",
             "content": "1. Please create a topic that penetrates the contents of the meeting\n"
                        "2. The generated topic must be one simple sentence\n"
                        "3. Please write it in Korean\n"
                        "4. Don't use the high expression"}
        ]
    )

    topic = topic_response.choices[0].message.content

    # 현재 날짜 및 시간
    current_date = datetime.datetime.now().strftime('%Y-%m-%d')
    current_time = datetime.datetime.now()

    # 시간 범위 형식화
    if first_time:
        time_range = format_time_range(first_time, current_time)
    else:
        time_range = None

    return jsonify({
        "full_summary": full_summary,
        "current_date": current_date,
        "topic_response": topic,
        "timeRange" : time_range
    })

# wkhtmltopdf 경로 설정
# config = pdfkit.configuration(
#     wkhtmltopdf="C:/Program Files/wkhtmltopdf/bin/wkhtmltopdf.exe")

# pdf 다운로드
@app.route('/result/<int:roomId>/download', methods=['POST'])
def export_pdf(roomId):
    try:
        html_content = request.json['htmlContent']
        print("html >>  ", html_content, file=sys.stdout)
        print("type >> ", type(html_content))
        pdf_filename = 'meeting_summary.pdf'

        Myoptions = {
            'encoding': 'utf-8',  # 인코딩 설정
            'footer-font-size': 10,
            'footer-font-name': 'MALGUN.TTF',  # 사용할 폰트 설정
            'quiet': '',
        }

        pdf = pdfkit.from_string(html_content, pdf_filename, options=Myoptions)

        # PDF를 클라이언트에 전송
        return send_file(pdf_filename, as_attachment=True)
    except Exception as e:
        return str(e)

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=8000)