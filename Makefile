# ─── Image & deploy variables ─────────────────────────────────────────────────
NAME            ?= vtafarm
REGISTRY        ?= ghcr.io/ic3software
IMAGE           ?= $(REGISTRY)/$(NAME)
CHART_REGISTRY  ?= oci://$(REGISTRY)/charts
CHART_DIR       ?= .charts
VERSION         ?= $(shell awk '/^version:/{print $$2; exit}' helm/$(NAME)/Chart.yaml)
TAG             ?= $(shell git rev-parse --short HEAD)
# The cluster nodes are x86, this laptop is not.
PLATFORM        ?= linux/amd64
NAMESPACE       ?= default
INGRESS_HOST    ?=
API_URL         ?=

.PHONY: image-build image-push release release-check release-image release-chart release-github deploy

# ─── GHCR ─────────────────────────────────────────────────────────────────────
image-build:
	docker build --platform $(PLATFORM) -t $(IMAGE):$(TAG) .

image-push: image-build
	docker push $(IMAGE):$(TAG)

release:
	@$(MAKE) release-check
	@$(MAKE) release-image
	@$(MAKE) release-chart
	@$(MAKE) release-github

release-check:
	@tag="v$(VERSION)"; \
	if ! git diff --quiet || ! git diff --cached --quiet; then \
	  echo "release requires a clean working tree"; \
	  exit 1; \
	fi; \
	if ! git tag -v "$$tag" >/dev/null 2>&1; then \
	  echo "missing or invalid signed tag: $$tag"; \
	  exit 1; \
	fi; \
	tagged_commit=$$(git rev-list -n 1 "$$tag"); \
	head_commit=$$(git rev-parse HEAD); \
	if [ "$$tagged_commit" != "$$head_commit" ]; then \
	  echo "$$tag points to $$tagged_commit, not HEAD $$head_commit"; \
	  exit 1; \
	fi

release-image:
	docker buildx build --platform $(PLATFORM) -t $(IMAGE):$(VERSION) --push .

release-chart:
	@mkdir -p $(CHART_DIR)
	helm package helm/$(NAME) -d $(CHART_DIR)
	helm push $(CHART_DIR)/$(NAME)-$(VERSION).tgz $(CHART_REGISTRY)

release-github: release-check
	@tag="v$(VERSION)"; \
	notes=$$(mktemp); \
	trap 'rm -f "$$notes"' EXIT; \
	awk -v tag="$$tag" 'index($$0, "## [" tag "]") == 1 { found=1; f=1; next } f && /^## \[/ { exit } f; END { if (!found) exit 1 }' CHANGELOG.md > "$$notes" || { \
	  echo "missing changelog section for $$tag"; \
	  exit 1; \
	}; \
	git push origin "$$tag" || exit 1; \
	if gh release view "$$tag" >/dev/null 2>&1; then \
	  echo "GitHub release $$tag already exists"; \
	  exit 0; \
	fi; \
	gh release create "$$tag" --notes-file "$$notes"

# ─── Kubernetes (Helm) ────────────────────────────────────────────────────────
deploy:
	helm upgrade $(NAME) ./helm/vtafarm \
	  --set image.repository=$(IMAGE) \
	  --set image.tag=$(TAG) \
	  --set ingress.host=$(INGRESS_HOST) \
	  --set api.url=$(API_URL) \
	  --install --atomic --timeout=10m \
	  --namespace=$(NAMESPACE)
