# Huong dan su dung Sol Advisor

Sol Advisor da duoc dat trong workspace tai `tools/sol-advisor/` va dang duoc Codex nhan dien nhu plugin `sol-advisor@sol-advisor`.

Trang upstream: <https://github.com/DannyMac180/sol-advisor>

## Trang thai trien khai

- Local checkout: `tools/sol-advisor/`
- Remote: `https://github.com/DannyMac180/sol-advisor.git`
- Commit da kiem tra voi upstream `main`: `154fd7a`
- Plugin Codex: `sol-advisor@sol-advisor`, version `0.4.0`, status `installed, enabled`
- Companion agents da cai trong `C:\Users\user\.codex\agents\`:
  - `sol-advisor-terra-implementer.toml`
  - `sol-advisor-sol-reviewer.toml`
- File Luna companion cu `sol-advisor-luna-implementer.toml` khong ton tai, dung voi thiet ke hien tai cua Sol Advisor.

## Khi nao dung

Dung Sol Advisor cho cac viec can kien truc, chia viec, sua code co rui ro, refactor lon, migration, hoac bat buoc co vong review doc lap truoc khi ket luan xong.

Khong can dung cho viec rat nho nhu doc mot file, chay mot lenh, hoac sua typo don gian.

## Cach goi trong Codex

Mac dinh nen dung native lane:

```text
Use $sol-advisor:orchestration to build this feature, verify it, and obtain the final Sol review before reporting done.
```

Hoac viet ngan gon theo yeu cau cu the:

```text
Use Sol Advisor's native lane to fix [mo ta loi], verify it, and obtain the fresh Sol review before completion.
```

Native lane dung hai agent:

- Terra implementer: thuc hien implementation.
- Sol reviewer: review moi, doc lap ve context, tra ve `ship`, `fix-first`, hoac `rethink`.

Sau khi cai moi hoac cap nhat companion agents, hay mo mot Codex task moi. Codex chi nhan dien native custom agents luc task moi duoc tao.

## Luna task lane

Chi dung Luna lane khi muon tao user-visible Codex task rieng va ban noi ro trong yeu cau hien tai:

```text
Use the Luna task lane for this feature.
```

Neu khong co cau uy quyen nay, Sol Advisor se di theo native lane. Luna lane khong dung file TOML companion va khong can cai Luna agent.

## Lenh kiem tra tren may nay

Kiem tra plugin dang duoc Codex nhan:

```powershell
codex plugin list
```

Kiem tra checkout local co dung upstream:

```powershell
git -C tools/sol-advisor status --short
git -C tools/sol-advisor ls-remote origin refs/heads/main
git -C tools/sol-advisor rev-parse --short HEAD
```

Kiem tra hai companion agent co khop template trong repo:

```powershell
Compare-Object (Get-Content -Raw tools\sol-advisor\plugins\sol-advisor\agents\sol-advisor-terra-implementer.toml) (Get-Content -Raw "$env:USERPROFILE\.codex\agents\sol-advisor-terra-implementer.toml")
Compare-Object (Get-Content -Raw tools\sol-advisor\plugins\sol-advisor\agents\sol-advisor-sol-reviewer.toml) (Get-Content -Raw "$env:USERPROFILE\.codex\agents\sol-advisor-sol-reviewer.toml")
Test-Path "$env:USERPROFILE\.codex\agents\sol-advisor-luna-implementer.toml"
```

Ket qua mong doi:

- Hai lenh `Compare-Object` khong in gi.
- `Test-Path` tra ve `False`.

## Cai lai tu GitHub neu can

Neu can cai lai tu GitHub marketplace:

```powershell
codex plugin marketplace add DannyMac180/sol-advisor --ref main
codex plugin add sol-advisor@sol-advisor
```

Neu may co Git Bash hoac moi truong `sh`, co the chay installer companion agent cua plugin:

```sh
cd tools/sol-advisor
sh plugins/sol-advisor/scripts/install-agents.sh
sh plugins/sol-advisor/scripts/install-agents.sh --check
```

Tren Windows hien tai, PATH chua co `sh`/`jq`, nen cach kiem tra PowerShell o tren la cach thuc te nhat.
