# 해외 골든셋 채점 결과

갱신 2026-11-10 22:17, 모델 gemini-3.5-flash-lite, Google Places 키 있음. 운영 해외 게시물 21건과 국내 대조군 3건을 돌렸다.

| 지표 | 값 | 목표 |
|---|---|---|
| 해외 게시물 단서 가운데 해외로 판단한 비율 | 48/48 | 모두 |
| 해외 게시물 단서 가운데 나라 코드까지 맞힌 비율 | 38/38 | 모두 |
| 해외 게시물에 국내 장소가 붙은 수 | 0 | 0 |
| 사람이 확인한 정답 Google ID 가운데 다시 찾은 장소 | 33/35 | 높을수록 |
| 사람이 오답으로 판정한 Google ID가 다시 붙은 수 | 4 | 0 |
| 이름을 적은 해외 정답 가운데 찾은 장소(이름 낱말과 도시로 느슨하게 맞춤, 참고) | 14/24 | 높을수록 |
| 대조군에서 해외로 보낸 단서 수 | 0 | 0 |

해외 정답은 Google 장소 ID를 아직 확정하지 않아서, 아래 표의 찾은 장소를 사람이 보고 맞는지 확인한 뒤 ID를 적는다.

| 사례 | 상태 | 나라(정답) | 단서의 나라 | 경로 | 찾은 장소 | 정답 적중 | 메모 |
|---|---|---|---|---|---|---|---|
| O01 | NONE | JP | 단서 없음 | 캡션→첨부 |  |  | 캡션은 #japan뿐이고 seed 감사에서 소개 장소를 찾지 못함 |
| O02 | VIDEO_VERIFIED | JP | JP | 캡션 | G Narasawa Shrine (8975 Iiyama, Nagano 389-2253) | 확인 1/1 | 신사 축제 영상. 11-09 인스타그램 영상 자막 「Narasawa Shrine festival」과 신사 경내 장면으로 신사를 정답으로 둠 |
| O03 | NONE | - | 단서 없음 | 캡션→첨부 |  |  | 해외 겨울 여행지(도시와 지역) 8곳 모음이라 가게나 시설이 아님 |
| O04 | CAPTION_LABELED | AT | AT | 캡션 | G 라트하우스광장 (Rathauspl., 1010 Wien) | 확인 1/1 | 캡션 주소 Rathausplatz, 1010 Wien. 기간 한정 마켓이라 광장으로 잡혀도 맞음으로 봄 |
| O05 | PHOTO_VERIFIED | - | FR, AT, GB, IT, ES, JP, SG, MA, PE, AU | 캡션→첨부 | G Le Restaurant du Musée d'Orsay (1 Rue de la Légion d'Honneur, 75007 Paris)<br>G Café im Kunsthistorischen Museum Wien (Maria-Theresien-Platz 1, 1010 Wien)<br>G The V&A Cafe (Cromwell Rd, London SW7 2RL)<br>G Bar Luce (L.go Isarco, 2, 20139 Milano MI)<br>G Restaurant Absis (08038 Barcelona, Sants-Montjuïc, 카탈루냐 미술관)<br>G 네즈카페 (6-chōme-5-1 Minamiaoyama, Minato City, Tokyo 107-0062)<br>G Odette (1 St Andrew's Rd, #01-04 National Gallery, Singapore 178957)<br>G Cafe Museo Larco (Avenida Simón Bolivar 1515 Ingreso por, frente al, Parque Larco, Navarra 169, Pueblo Libre 15084)<br>G Faro Bar + Restaurant (655 Main Rd, Berriedale TAS 7011) | 확인 9/10 | 박물관 속 카페와 레스토랑 10곳 모음. 이름은 사진 안에만 있어 아직 못 적음 11-09 사진으로 10곳 확인 |
| O06 | PHOTO_VERIFIED | JP | JP | 캡션→첨부 | G 오타루 코라쿠엔 (5-chōme-18-2 Shinkō, Otaru, Hokkaido 047-0152)<br>G 오쿠조잔케이 온천 가마쓰 교엔 (카쇼교엔) (857 Jōzankei, Minami Ward, Sapporo, Hokkaido 061-2301)<br>G 수이잔테이 클럽 조잔케이 (2-chōme-2-10 Jōzankeionsennishi, Minami Ward, Sapporo, Hokkaido 061-2303)<br>G 쿠리야 스이잔 (3-chōme-4 Jōzankeionsennishi, Minami Ward, Sapporo, Hokkaido 061-2303)<br>G 스파 & 에스테틱 스이쵸칸 (3-chōme-57 Jōzankeionsennishi, Minami Ward, Sapporo, Hokkaido 061-2303)<br>G 호시노 리조트 카이 포로토 (1-chōme-2-1018-94 Wakakusachō, Shiraoi, Shiraoi District, Hokkaido 059-0902)<br>G 온천 료칸 유엔 삿포로 (〒060-0001 北海道札幌市中央区北１条西７丁目６)<br>G 조잔케이 유라쿠소안 (3-chōme-228-1 Jōzankeionsenhigashi, Minami Ward, Sapporo, Hokkaido 061-2301) | 확인 8/9 | 홋카이도 료칸 8곳 모음. 이름은 사진 안에만 있어 아직 못 적음 11-09 사진으로 8곳 확인. 11-09 인스타그램 넷째 슬라이드 제목 「스이잔테이 & 스이잔테이 클럽」으로 본관(조잔케이 다이치 호텔 스이잔테이)도 정답에 넣음 |
| O07 | NONE | - | 단서 없음 | 캡션→첨부 |  |  | 북유럽 겨울 여행지(도시와 마을) 8곳 모음이라 가게나 시설이 아님 |
| O08 | NEEDS_LABEL | JP | 단서 없음 | 캡션→첨부 |  |  | 교토 온천 소개. 캡션에 상호가 없음 |
| O09 | CAPTION_LABELED | JP | JP | 캡션 | G Musashi Bettei Ganryūjima (〒104-0061 Tokyo, Chuo City, Ginza, 7-chōme−2−２０ PACIFIC GINZA BLDG, 5F)<br>G 돈카츠 스즈키 (〒100-0005 Tokyo, Chiyoda City, Marunouchi, 1-chōme−9−１ グランスタ八重北 １階 Yaekita Shokudo)<br>G 곤파치 니시아자부(킬빌) (1-chōme-13-11 Nishiazabu, Minato City, Tokyo 106-0031)<br>G 멘키 야시마 (〒150-0044 Tokyo, Shibuya, Maruyamachō, 10−１３ サンライズビル 1階)<br>G 센트레 더 베이커리 (〒104-0061 Tokyo, Chuo City, Ginza, 1-chōme−2−１ 紺屋ビル 1F 東京高速道路) | 확인 4/4, 오답 1 | 도쿄 맛집 10곳. 11-09 정콩 결정으로 지점 근거 없는 체인 6곳(모헤지, 모토무라, 쿠라 스시, 우나테츠, 멘키 야시마, 팡 메종)은 넣지 않는 것이 정답이라 오답 ID로 둠. 지금 운영은 국내 가게 3곳이 잘못 붙음(종로 츠키시마몬자모헤지, 해운대 쿠라, 당산 메종드팡) |
| O10 | PHOTO_VERIFIED | JP | JP | 캡션→첨부 | G 하카타 모츠나베 마에다야 신주쿠점 (〒160-0022 Tokyo, Shinjuku City, Shinjuku, 3-chōme−23−１２ Pandora Building, 3F)<br>G 간소 에비다시 몬자노 에비센 (〒150-0002 Tokyo, Shibuya, 3-chōme−21−３ 渋谷ストリーム 2F) | 확인 2/2 | 도쿄 맛집 영상. 캡션에 상호가 없음 11-09 영상 속 지도 화면으로 2곳 확인(하카타 모츠나베 마에다야 신주쿠점, 간소 에비다시 몬자노 에비센) |
| O11 | CAPTION_LABELED | JP | JP | 캡션 | G unito OSAKA Shinsaibashi West (1-chōme-22-20 Kitahorie, Nishi Ward, Osaka, 550-0014) | 확인 1/1 | 캡션 주소 1 Chome-22-20 Kitahorie, Nishi Ward, Osaka |
| O12 | CAPTION_LABELED | JP | JP | 캡션 | G Dotonbori Crystal Exe Hotel (3-chōme-6-15 Kawarayamachi, Chuo Ward, Osaka, 542-0066) | 확인 1/1 | 캡션 주소 大阪府大阪市中央区瓦屋町3-6-15 |
| O13 | NONE | JP | JP | 캡션→첨부 |  |  | 후쿠오카 마사지 가게. 11-09 인스타그램 영상(7초)에 간판이나 상호가 없고 캡션 「극락마사지였음」은 감탄사이며 구글 링크는 댓글로만 준다고 함. 이치란은 곁가지 체인이라 오답. 지금 운영은 창원 라멘집이 잘못 붙음 |
| O14 | NONE | TW | 단서 없음 | 캡션→첨부 |  |  | 타이베이 시장 볶음밥. 가게 이름과 위치는 DM으로만 알려 준다고 함 |
| O15 | NONE | TW | 단서 없음 | 캡션→첨부 |  |  | 타이베이 만두집. 가게 이름과 위치는 DM으로만 알려 준다고 함 |
| O16 | CAPTION_LABELED | TW | TW | 캡션 | G 菓酪格格御糬點心所 (No. 213號, Minsheng W Rd, Datong District, Taipei City, 103) | 확인 1/1 | 캡션 주소 No. 213, Minsheng W Rd, Datong District, Taipei |
| O17 | CAPTION_LABELED | TW | TW | 캡션 | G 寶桂的店 豆腐麻糬 (No. 114號, Shenkeng St, Shenkeng Village, Shenkeng District, New Taipei City, 222) | 확인 1/1 | 캡션 주소 No. 116, Shenkeng St, Shenkeng District, New Taipei City |
| O18 | CAPTION_LABELED | JP | JP | 캡션 | G 카페 하르모 (1-chōme-7-21 Imaizumi, Chuo Ward, Fukuoka, 810-0021) | 확인 1/1 | 캡션 표기 Cafe&Dining ハルモ 天神今泉公園前店, 주소 Fukuoka Chuo Ward Imaizumi 1-7-21 |
| O19 | CAPTION_LABELED | JP | JP | 캡션 | G 규카츠 토미타 (〒556-0011 Osaka, Naniwa Ward, Nanbanaka, 2-chōme−3−１ ２階)<br>G 이즈모 우나기 (5-chōme-12-18 Fukushima, Fukushima Ward, Osaka, 553-0003) | 확인 1/1, 오답 1 | 오사카 맛집 셋. 이즈모 우나기(2곳)와 잇신도(4곳)는 지점 근거가 없어 넣지 않는 것이 정답(11-09 체인 정책). 지금 운영은 송도 잇신카레&라멘이 잘못 붙음 |
| O20 | PARTIAL | CN | 단서 없음 | 캡션→첨부 |  | 이름 0/6 | 오류: 장소 정보를 처리하지 못했어요 <- 장소 정보를 처리하지 못했어요 |
| O21 | CAPTION_LABELED | CN | CN | 캡션 | G Taidong Commercial Pedestrain Street (Shan Dong Sheng, Qing Dao Shi, Shi Bei Qu, 台东台东三路 邮政编码: 266021)<br>G 万象城 (10 Shan Dong Lu, LiCun ShangQuan, Shi Nan Qu, Qing Dao Shi, Shan Dong Sheng, 266072)<br>G Muye Shi Ge Kao Chuan (39号甲 Si Ping Lu, 39, Shi Bei Qu, Qing Dao Shi, Shan Dong Sheng, 266021)<br>G Tsingtao Brewery Museum (Shan Dong Sheng, Qing Dao Shi, Shi Bei Qu, Deng Zhou Lu, 56号-1 邮政编码: 266022)<br>G Meida'er (125 Zhong Shan Lu, 中山路商圈 Shi Bei Qu, Qing Dao Shi, Shan Dong Sheng, 266001) | 확인 2/2, 오답 2 | 칭다오 맛집 일곱 곳. 메이다얼은 지점 20곳 이상이라 넣지 않는 것이 정답(11-09 체인 정책). 주식맥주와 삼림해선대배당은 Google에 없고, 万象城(옆 몰)과 East Town Hot Pot(다른 가게)은 오답. 지금 운영은 국내 가게 2곳이 잘못 붙음(서초 포차주식시장, 남이섬 스윙까페) |
| K01 | NONE | - | 단서 없음 | 캡션→첨부 |  |  | 대조군. 일본 로맨스 만화 순위라 장소가 없음 |
| K02 | NONE | - | 단서 없음 | 캡션→첨부 |  |  | 대조군. 일본 신상 가챠 상품 소개라 장소가 없음 |
| K03 | CAPTION_LABELED | KR | KR | 캡션 | G 동멘 (서울특별시 영등포구 문래동2가 번지 1층 49-23) | 이름 1/1 | 대조군. 일본 라멘을 파는 국내 가게라 카카오로 가야 함. 캡션 주소 문래동2가 49-23. seed-data 검수(11-01)가 문을 닫은 가게로 봐서(회원 골든셋 U053) 국내로 보내는지만 보고 장소 맞히기는 보지 않음 |
