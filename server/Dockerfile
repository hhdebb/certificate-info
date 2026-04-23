# syntax=docker/dockerfile:1

# Build container
FROM golang:1.22-alpine AS build

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 GOOS=linux \
    go build -o /out/certificate-info -ldflags="-s -w" .

# Minimum runtime container
FROM alpine:3.20

RUN apk add --no-cache ca-certificates && \
    addgroup -S app && adduser -S -G app app

COPY --from=build /out/certificate-info /bin/certificate-info

USER app
ENV PORT="8000"
EXPOSE 8000

ENTRYPOINT ["/bin/certificate-info"]
