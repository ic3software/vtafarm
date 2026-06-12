# ─── Image & deploy variables ─────────────────────────────────────────────────
NAME            ?= vtafarm
DOCKER_USERNAME ?=
IMAGE           ?= $(DOCKER_USERNAME)/$(NAME)
TAG             ?= $(shell git rev-parse --short HEAD)
NAMESPACE       ?= default
INGRESS_HOST    ?=
API_URL         ?=

.PHONY: image-build image-push deploy

# ─── Docker Hub ───────────────────────────────────────────────────────────────
image-build:
	docker build \
	  --build-arg VITE_API_URL=$(API_URL) \
	  -t $(IMAGE):$(TAG) \
	  -t $(IMAGE):latest .

image-push: image-build
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

# ─── Kubernetes (Helm) ────────────────────────────────────────────────────────
deploy:
	helm upgrade $(NAME) ./helm/vtafarm \
	  --set image.repository=$(IMAGE) \
	  --set image.tag=$(TAG) \
	  --set ingress.host=$(INGRESS_HOST) \
	  --install --atomic --timeout=10m \
	  --namespace=$(NAMESPACE)
