BINARY := certificate-info

all: build

build:
	@go build -o $(BINARY) .

run:
	@go run .

test:
	@go vet ./...

clean:
	@rm -f $(BINARY)

docker-push:
	@docker build -t blupig/certificate-info .
	@docker push blupig/certificate-info

.PHONY: all build run test clean docker-push
