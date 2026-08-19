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

.PHONY: image-build image-push release release-image release-chart deploy

# ─── GHCR ─────────────────────────────────────────────────────────────────────
image-build:
	docker build --platform $(PLATFORM) -t $(IMAGE):$(TAG) .

image-push: image-build
	docker push $(IMAGE):$(TAG)

release: release-image release-chart

release-image:
	docker buildx build --platform $(PLATFORM) -t $(IMAGE):$(VERSION) --push .

release-chart:
	@mkdir -p $(CHART_DIR)
	helm package helm/$(NAME) -d $(CHART_DIR)
	helm push $(CHART_DIR)/$(NAME)-$(VERSION).tgz $(CHART_REGISTRY)

# ─── Kubernetes (Helm) ────────────────────────────────────────────────────────
deploy:
	helm upgrade $(NAME) ./helm/vtafarm \
	  --set image.repository=$(IMAGE) \
	  --set image.tag=$(TAG) \
	  --set ingress.host=$(INGRESS_HOST) \
	  --set api.url=$(API_URL) \
	  --install --atomic --timeout=10m \
	  --namespace=$(NAMESPACE)
