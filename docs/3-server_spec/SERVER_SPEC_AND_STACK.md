# 서버 스펙 및 기술 스택

기준 시각: 2026-03-17 (Asia/Seoul)

## 1) 서버 스펙
- OS: Ubuntu 22.04.5 LTS (Jammy Jellyfish)
- Kernel: `5.15.0-171-generic`
- CPU: Intel(R) Celeron(R) G1610T @ 2.30GHz
- vCPU: 2 (2코어 / 2스레드)
- 메모리: 3.8 GiB RAM
- 스왑: 3.7 GiB
- 루트 디스크(`/`): 227G 중 32G 사용, 185G 여유 (약 15% 사용)

## 2) 설치된 주요 런타임/도구
- Docker: `28.1.1`
- Docker Compose: `v2.35.1`
- Node.js: `v20.20.0`
- npm: `10.8.2`
- npx: `10.8.2`
- Python: `3.10.12`
- Git: `2.34.1`
- 참고: `pip3` 미설치 (`command not found`)

## 3) 현재 실행 중 컨테이너 (요약)
- n8n 스택
  - `n8n-n8n-1` (`n8nio/n8n:latest`)
  - `n8n-postgres-1` (`postgres:16-alpine`)
- 쿠팡 자동화/블로그 스택
  - `coupang-blog-web`
  - `coupang-automation`
  - `coupang-minio`
  - `coupang-postgres`
  - `customer-blog-web`
  - `customer-automation`
  - `customer-minio`
  - `customer-postgres`

## 4) 확인에 사용한 명령
```bash
uname -a
cat /etc/os-release
lscpu
free -h
df -h /
docker --version
docker compose version
node -v && npm -v && npx -v
python3 --version
git --version
docker ps
```

## 5) 서버 접속 주소 및 접속 방법
- 호스트명: `insuk`
- SSH 포트: `22` (현재 리스닝 확인)
- LAN 주소(내부망): `192.168.0.5`
- Tailscale 주소(원격망): `100.107.201.37`

### SSH 접속 예시
```bash
# 내부망에서 접속
ssh insuk@192.168.0.5

# Tailscale 경유 접속
ssh insuk@100.107.201.37
```

### 파일 다운로드(scp) 예시
```bash
# 로컬(개발 PC)에서 실행: 현재 폴더로 다운로드
scp insuk@192.168.0.5:/home/insuk/SERVER_SPEC_AND_STACK.md .

# Tailscale 경유
scp insuk@100.107.201.37:/home/insuk/SERVER_SPEC_AND_STACK.md .
```

### 접속 점검 명령
```bash
# 로컬에서 SSH 연결 확인
ssh -v insuk@192.168.0.5

# 서버에서 SSH 리스닝 포트 확인
ss -tln | grep ':22'
```
