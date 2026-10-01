# CloudWatch 에이전트 설정

여기담 서버가 로그와 지표를 CloudWatch로 보내는 데 쓰는 에이전트 설정 원본이다. JSON에는 주석을 못 쓰므로 설명을 여기에 둔다.

| 파일 | 서버 | 보내는 것 |
| --- | --- | --- |
| `agent-app.json.template` | 앱 서버(yeogidam-dev, yeogidam-prod) | nginx access와 error 로그, 메모리와 디스크 사용률 |
| `agent-db.json.template` | 개발 DB 서버(yeogidam-dev-db) | MySQL slow와 error 로그, 메모리와 디스크 사용률 |

앱 컨테이너의 로그는 에이전트가 아니라 도커 `awslogs` 로그 드라이버가 보낸다(`Backend/scripts/deploy.sh`). nginx는 호스트 systemd로 돌아 파일로 남기므로 에이전트가 읽는다.

## 서버에 반영하기

`${ENV_NAME}`만 채워 `/opt/aws/amazon-cloudwatch-agent/etc/config.json`으로 렌더하고 `amazon-cloudwatch-agent-ctl -a fetch-config`로 적용한다. 손으로 하지 않고 스크립트를 돌린다.

```bash
# 앱 서버
sudo SERVER_NAME=<도메인> CERT_EMAIL=<메일> ENV_NAME=dev bash Infra/scripts/bootstrap-host.sh
# 개발 DB 서버
sudo ENV_NAME=dev bash Infra/scripts/bootstrap-db-host.sh
```

두 스크립트 모두 두 번 돌려도 안전하다. 렌더 결과가 지금 설정과 같고 에이전트가 돌고 있으면 건너뛴다.

## 이름이 콘솔과 맞아야 한다

로그 그룹은 콘솔에서 태그(`Service=techcourse`, `Role=techcourse-etc`, `ProjectTeam=yeogidam`)를 달아 미리 만들어 두었고 보존은 1개월이다.

| 로그 그룹 | 스트림 |
| --- | --- |
| `/yeogidam/dev/backend`, `/yeogidam/prod/backend` | 앱 컨테이너(도커 드라이버가 쓴다) |
| `/yeogidam/dev/nginx`, `/yeogidam/prod/nginx` | `access`, `error` |
| `/yeogidam/dev/mysql` | `slow`, `error` |

우테코 공용 계정은 태그 없는 리소스를 관리자가 지운다. 에이전트는 없는 그룹을 만나면 태그 없이 만들어 버리므로, 템플릿의 `log_group_name`을 고칠 때는 콘솔에 그 이름의 그룹이 먼저 있어야 한다. 같은 이유로 `retention_in_days`를 템플릿에 넣지 않는다. 넣으면 에이전트가 보존 기간을 덮어쓴다.

지표 네임스페이스는 `Yeogidam/dev`, `Yeogidam/prod`다. 커스텀 지표는 개당 월 0.3달러라 서버당 `mem_used_percent`, `disk_used_percent` 두 개만 보낸다. `omit_hostname`이 true라 호스트 이름 차원은 빠지고, `mem_used_percent`에는 `InstanceId` 하나가 붙는다. `disk_used_percent`는 `drop_device`가 장치 이름(`device`) 차원만 빼므로 `InstanceId`에 `path`와 `fstype`이 더 붙는데, `resources`가 `/` 하나라 지표 수는 서버당 1개로 같다. 콘솔에서 지표를 고를 때 메모리는 「InstanceId」 묶음에, 디스크는 「InstanceId, fstype, path」 묶음에 따로 보인다.

## 자리표 두 종류

`${ENV_NAME}`은 스크립트가 envsubst로 채우고, `${aws:InstanceId}`는 에이전트가 자기 문법으로 채운다. envsubst는 셸 변수 이름 꼴(`${ENV_NAME}`)만 치환하므로 `${aws:InstanceId}`는 목록이 없어도 건드리지 않지만, 앞으로 템플릿에 다른 `$이름`이 들어가도 `ENV_NAME`만 바뀌도록 렌더는 `envsubst '${ENV_NAME}'`처럼 목록을 준다.

## 로그 이벤트의 시각

`collect_list` 항목에 `timestamp_format`을 주지 않았으므로 이벤트 시각은 로그 줄에 적힌 시각이 아니라 에이전트가 그 줄을 읽은 시각이다. `timezone` 키는 `timestamp_format`이 있을 때만 뜻이 있어 넣지 않는다. 실시간으로 읽는 동안에는 몇 초 차이라 상관없지만, 에이전트가 멈췄다가 밀린 줄을 한꺼번에 올리면 그 줄들이 전부 올린 시각으로 찍히므로 Logs Insights에서 시간순으로 볼 때는 로그 줄 안의 시각을 같이 본다. 줄 안의 시각을 이벤트 시각으로 쓰고 싶어지면 nginx access 항목에 `timestamp_format`을 `%d/%b/%Y:%H:%M:%S %z`로 주면 되고, `timezone` 키는 형식에 `%z` 같은 오프셋이 없을 때만 뜻을 가지므로 그때 필요한지 다시 본다.

## 로컬에서 검사하기

로컬에 에이전트가 없으므로 렌더 결과가 유효한 JSON인지와 에이전트 자리표가 살아 있는지만 본다.

```bash
for f in Infra/cloudwatch/agent-*.json.template; do
  ENV_NAME=dev envsubst '${ENV_NAME}' < "$f" | python3 -m json.tool > /dev/null && echo "ok $f"
  ENV_NAME=dev envsubst '${ENV_NAME}' < "$f" | grep -q 'aws:InstanceId' || echo "InstanceId 자리표가 사라짐 $f"
done
```

## 서버에서 확인하기

- 에이전트 상태: `sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status`
- 에이전트 로그: `/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log`. 권한이나 그룹 이름 문제는 여기에 남는다.
- 콘솔: 로그 그룹에 스트림이 생기고, 지표 네임스페이스 `Yeogidam/<env>`의 「InstanceId」 묶음에 `mem_used_percent`가, 「InstanceId, fstype, path」 묶음에 `disk_used_percent`가 보이면 된 것이다. 지표는 60초 간격이라 첫 값까지 1~2분 걸린다.

## 알림 경로

CloudWatch 알람 -> SNS 토픽 `yeogidam-alerts` -> Lambda `yeogidam-alerts-to-discord` -> Discord 웹훅이다. Lambda 코드는 `Infra/lambda/alerts_to_discord.py`이고 콘솔 등록 절차는 그 파일 머리 docstring에 있다. 지표 필터와 대시보드와 알람은 콘솔에서 만든다.
