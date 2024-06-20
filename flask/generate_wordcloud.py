# # 아래의 명령어 콘솔에서 실행
# # mecab-python의 버전 오류로 인해 아래 패키지를 설치하면 코랩에서 Mecab을 사용가능
# !pip install mecab-python3
# !apt-get update
# !apt-get install g++ openjdk-8-jdk
# !pip install konlpy JPype1-py3
# !bash <(curl -s https://raw.githubusercontent.com/konlpy/konlpy/master/scripts/mecab.sh)

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import requests
import pandas as pd
import re
from konlpy.tag import Komoran
from nltk import FreqDist
import numpy as np
from PIL import Image
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import os
import io
from bson.objectid import ObjectId

app = Flask(__name__)
CORS(app)

# DB 접속
uri = f"mongodb+srv://njeon671:7mvEjoODB3B40U1J@cluster0.kjw1zru.mongodb.net/"
client = MongoClient(uri)
db = client['test']
collection = db['datas']
image_collection = db['image']  # 이미지 저장

@app.route('/generate_wordcloud', methods=['POST'])
def generate_wordcloud():
  # DB에서 데이터 가져오기
  documents = collection.find()
  script = [document.get('sttMsg').strip() for document in documents]

  a = '\n'.join(script)
  A = a.strip().split('\n') # 공백제거

  AA = [re.sub('[^가-힣 ]', '', x) for x in A if x] #영어 제외

  AAA = [x.strip() for x in AA if x.strip()]

  komoran = Komoran()

  stopwords = ['안녕','안녕하세요','오케이','수','것','점','집','때','거','원','정도','식','번','중','분','와','안', '명', '일부',
             '결', '자', '월', '오늘','말','다음','살','등','입','감','한','위','시','게','건','이랑','제가',
             '듯','글','이','회','후','가지','때문','포','편','내일','속','토','곳','일', '이것',
            '인','이전','앞','야','전','층','장','간','어디','보니','개','날','그런지','삼','지','바','데']

  # 명사추출
  noun_list = []

  for x in AAA:
    if x =='':
        continue
    else:
        #n = komoran.nouns(x)
        for y in komoran.nouns(x):
            if not y in stopwords:
                noun_list.append(y)

  vocab = FreqDist(np.hstack(noun_list))
  vocab2 = vocab.most_common(30)

  # 이미지 생성
  mask = Image.new("RGBA",(1068,1068), (255,255,255))
  image = Image.open('cloud.png').convert("RGBA")
  x,y = image.size
  mask.paste(image,(0,0,x,y),image)
  mask = np.array(mask)

  # 7 shape 이미지틀에서 빈도수별로 크기가 다른 단어들 출력하기

  font='./NotoSansCJKkr-Regular.otf'
  wc = WordCloud(font_path=font, background_color='white',
                width=mask.shape[1], height=mask.shape[0], max_font_size=400,
                mask=mask,colormap='Dark2_r', margin=0).generate_from_frequencies(dict(vocab2))

  # 이미지 저장
  img_byte_arr = io.BytesIO()
  wc.to_image().save(img_byte_arr, format='PNG')
  img_byte_arr.seek(0)
  
  # mongoDB에 저장
  image_id = image_collection.insert_one({'image' : img_byte_arr.getvalue()}).inserted_id

  return jsonify({'image_id' : str(image_id)})

@app.route('/get_image/<image_id>', methods = ['GET'])
def get_image(image_id):
  # DB에서 이미지 가져옴
  image_data = image_collection.find_one({'_id': ObjectId(image_id)})
  
  if image_data:
    # 이미지 데이터를 BytesIO 객체로 변환
    image_byte = io.BytesIO(image_data['image'])
    image_byte.seek(0)
    # 이미지 클라이언트 전송
    return send_file(image_byte, mimetype='image/png')
  else:
    return jsonify({'error' : 'Image not found'})

@app.route('/', methods = ['GET'])
def hello():
  return 'hello wordcloud'

if __name__ == "__main__":
  app.run(host = '0.0.0.0', port=5000)
