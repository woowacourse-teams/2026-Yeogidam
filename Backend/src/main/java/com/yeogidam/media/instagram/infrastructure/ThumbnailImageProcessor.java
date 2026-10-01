package com.yeogidam.media.instagram.infrastructure;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * 이미지 데이터를 디코딩해 해상도를 검사하고 저장할 썸네일을 만든다.

 * 처리 기준은 다음과 같다.

 *  {@code minimumLongEdge}가 0 이하이면 최소 해상도를 검사하지 않는다. 카카오 장소 사진은 400px 기준을 전달한다.
 *  디코딩할 수 있는 이미지의 긴 변이 기준보다 짧으면 저장을 거부한다. 세로 사진도 짧은 변이 아니라 긴 변으로 판단한다.
 *  이미지를 디코딩할 수 없으면 해상도 검사를 건너뛰고 원본 바이트와 기존 콘텐츠 타입·확장자를 유지한다.
 *  디코딩한 이미지는 비율을 유지하면서 긴 변이 최대 640px가 되도록 줄인다. 이미 더 작으면 확대하지 않는다.
 *  축소 결과를 JPEG 품질 0.78로 인코딩하고, 결과 바이트가 원본보다 작을 때만 JPEG를 사용한다.
 *  인코딩에 실패하거나 결과가 원본보다 작지 않으면 원본 바이트와 기존 콘텐츠 타입·확장자를 유지한다.

 * 최소 해상도 검사와 축소가 같은 디코딩 결과를 사용하므로, 이미지 바이트는 한 번만 디코딩한다.
 */
@Component
final class ThumbnailImageProcessor {

    private static final int MAX_DIMENSION = 640;
    private static final float JPEG_QUALITY = 0.78f;
    private static final String JPEG_CONTENT_TYPE = "image/jpeg";
    private static final String JPEG_EXTENSION = ".jpg";

    ProcessedThumbnail process(byte[] original, String contentType, String extension) {
        return process(original, contentType, extension, 0);
    }

    ProcessedThumbnail process(byte[] original, String contentType, String extension, int minimumLongEdge) {
        BufferedImage decoded = decode(original);
        if (decoded == null) {
            return originalThumbnail(original, contentType, extension);
        }
        if (!meetsMinimumLongEdge(decoded, minimumLongEdge)) {
            return null;
        }
        return resizeIfUseful(original, decoded, contentType, extension);
    }

    private ProcessedThumbnail resizeIfUseful(
            byte[] original,
            BufferedImage decoded,
            String contentType,
            String extension
    ) {
        byte[] resized = encodeJpeg(resize(decoded));
        if (resized == null || resized.length >= original.length) {
            return originalThumbnail(original, contentType, extension);
        }
        return new ProcessedThumbnail(resized, JPEG_CONTENT_TYPE, JPEG_EXTENSION);
    }

    private boolean meetsMinimumLongEdge(BufferedImage image, int minimumLongEdge) {
        if (minimumLongEdge <= 0) {
            return true;
        }
        return Math.max(image.getWidth(), image.getHeight()) >= minimumLongEdge;
    }

    private BufferedImage decode(byte[] original) {
        try {
            return ImageIO.read(new ByteArrayInputStream(original));
        } catch (IOException exception) {
            return null;
        }
    }

    private BufferedImage resize(BufferedImage original) {
        int longestEdge = Math.max(original.getWidth(), original.getHeight());
        double scale = Math.min(1.0, (double) MAX_DIMENSION / longestEdge);
        int width = Math.max(1, (int) Math.round(original.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(original.getHeight() * scale));
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        draw(original, resized);
        return resized;
    }

    private void draw(BufferedImage original, BufferedImage resized) {
        Graphics2D graphics = resized.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.drawImage(original, 0, 0, resized.getWidth(), resized.getHeight(), null);
        graphics.dispose();
    }

    private byte[] encodeJpeg(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            return null;
        }
        return writeJpeg(writers.next(), image);
    }

    private byte[] writeJpeg(ImageWriter writer, BufferedImage image) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(bytes)) {
            if (output == null) {
                return null;
            }
            writer.setOutput(output);
            writer.write(null, new IIOImage(image, null, null), jpegWriteParameters(writer));
            output.flush();
            return bytes.toByteArray();
        } catch (IOException exception) {
            return null;
        } finally {
            writer.dispose();
        }
    }

    private ImageWriteParam jpegWriteParameters(ImageWriter writer) {
        ImageWriteParam parameters = writer.getDefaultWriteParam();
        parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        parameters.setCompressionQuality(JPEG_QUALITY);
        return parameters;
    }

    private ProcessedThumbnail originalThumbnail(byte[] original, String contentType, String extension) {
        return new ProcessedThumbnail(original, contentType, extension);
    }

    record ProcessedThumbnail(byte[] bytes, String contentType, String extension) {
    }
}
