#!/usr/bin/env bash

set -Eeuo pipefail

# 어떤 이미지를 배포할지 정한다.
#
# be-dev는 언제나 새로 빌드한다. be-release는 be-dev에서 이미 빌드하고 개발 서버에서
# 돌려 본 이미지를 그대로 승격한다(인프라 ADR-05). 머지하면 커밋 SHA가 달라져
# SHA로는 be-dev의 이미지를 찾지 못하므로, 머지 커밋의 두 번째 부모를 읽어 대상을 정한다.
#
# 내보내는 값
#   GITHUB_OUTPUT  mode(build 또는 promote), source_sha
#   GITHUB_ENV     IMAGE_TAG

fail() {
  printf '::error::%s\n' "$1"
  exit 1
}

require_value() {
  if [[ -z "$2" ]]; then
    fail "${1} 값이 비어 있습니다."
  fi
}

emit() {
  local mode="$1"
  local source_sha="$2"

  printf 'mode=%s\n' "$mode" >> "$GITHUB_OUTPUT"
  printf 'source_sha=%s\n' "$source_sha" >> "$GITHUB_OUTPUT"
  printf 'IMAGE_TAG=%s:%s\n' "$IMAGE_NAME" "$source_sha" >> "$GITHUB_ENV"
  printf '::notice::%s 모드입니다. 대상 커밋은 %s입니다.\n' "$mode" "$source_sha"
}

# 브랜치 이름과 PR 라벨을 둘 다 본다. 하나만 보면 실수로 열린다.
# 이름만 보면 hotfix/로 시작하는 아무 브랜치나 운영에 올라가고,
# 라벨만 보면 라벨을 잘못 붙인 PR이 그렇게 된다.
is_hotfix() {
  local pulls head_ref has_label

  pulls="$(gh api "repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/pulls" 2>/dev/null || true)"

  if [[ -z "$pulls" || "$pulls" == "[]" ]]; then
    return 1
  fi

  head_ref="$(printf '%s' "$pulls" | jq -r '.[0].head.ref // ""')"
  has_label="$(printf '%s' "$pulls" | jq -r '[.[0].labels[]?.name] | contains(["hotfix"])')"

  [[ "$head_ref" == hotfix/* && "$has_label" == "true" ]]
}

require_value "IMAGE_NAME" "${IMAGE_NAME:-}"
require_value "GITHUB_SHA" "${GITHUB_SHA:-}"
require_value "GITHUB_REF_NAME" "${GITHUB_REF_NAME:-}"
require_value "GITHUB_REPOSITORY" "${GITHUB_REPOSITORY:-}"

if [[ "$GITHUB_REF_NAME" != "be-release" ]]; then
  emit "build" "$GITHUB_SHA"
  exit 0
fi

if ! git rev-parse --verify --quiet origin/be-dev >/dev/null; then
  git fetch --no-tags --quiet origin "+refs/heads/be-dev:refs/remotes/origin/be-dev" \
    || fail "be-dev를 가져오지 못했습니다. checkout에 fetch-depth: 0이 있는지 확인해 주세요."
fi

SECOND_PARENT="$(git rev-parse --verify --quiet "${GITHUB_SHA}^2" || true)"

if [[ -n "$SECOND_PARENT" ]] && git merge-base --is-ancestor "$SECOND_PARENT" origin/be-dev; then
  # 두 번째 부모가 문서만 고친 커밋이면 그 SHA로 만든 이미지가 없다.
  # backend-cd.yml의 paths가 Backend/docs와 README를 빼기 때문이다.
  # 같은 코드 상태를 만든 가장 최근 커밋을 찾아 그 이미지를 쓴다.
  SOURCE_SHA="$(git rev-list -1 "$SECOND_PARENT" -- \
    'Backend' ':(exclude)Backend/docs' ':(exclude)Backend/README.md')"

  if [[ -z "$SOURCE_SHA" ]]; then
    fail "be-dev 이력에서 배포 대상 코드를 만든 커밋을 찾지 못했습니다."
  fi

  emit "promote" "$SOURCE_SHA"
  exit 0
fi

if is_hotfix; then
  emit "build" "$GITHUB_SHA"
  exit 0
fi

fail "be-release에 승격할 수 없는 커밋이 들어왔습니다. be-dev에서 Merge Commit으로 머지했는지 확인해 주세요. 운영 긴급 수정이라면 hotfix/로 시작하는 브랜치에서 hotfix 라벨을 붙인 PR로 올려 주세요."
