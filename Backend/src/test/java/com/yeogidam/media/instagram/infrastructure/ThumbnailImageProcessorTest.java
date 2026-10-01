package com.yeogidam.media.instagram.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ThumbnailImageProcessorTest {

    @Test
    void 이미지의_긴_변이_640을_넘으면_원본보다_작은_JPEG로_축소한다() throws IOException {
        // given
        byte[] original = createPngImage(1200, 900);
        ThumbnailImageProcessor processor = new ThumbnailImageProcessor();

        // when
        ThumbnailImageProcessor.ProcessedThumbnail processed = processor.process(
                original, "image/png", ".png");

        // then
        BufferedImage resized = ImageIO.read(new ByteArrayInputStream(processed.bytes()));
        assertThat(processed.bytes()).hasSizeLessThan(original.length);
        assertThat(processed.contentType()).isEqualTo("image/jpeg");
        assertThat(processed.extension()).isEqualTo(".jpg");
        assertThat(resized.getWidth()).isEqualTo(640);
        assertThat(resized.getHeight()).isEqualTo(480);
    }

    @Test
    void 디코딩할_수_없는_이미지는_원본을_그대로_사용한다() {
        // given
        byte[] original = { 1, 2, 3, 4 };
        ThumbnailImageProcessor processor = new ThumbnailImageProcessor();

        // when
        ThumbnailImageProcessor.ProcessedThumbnail processed = processor.process(
                original, "image/avif", ".avif");

        // then
        assertThat(processed.bytes()).isSameAs(original);
        assertThat(processed.contentType()).isEqualTo("image/avif");
        assertThat(processed.extension()).isEqualTo(".avif");
    }

    @Test
    void 세로_사진은_짧은_변보다_긴_변으로_최소_해상도를_판단한다() throws IOException {
        // given
        byte[] portrait = createPngImage(386, 515);
        ThumbnailImageProcessor processor = new ThumbnailImageProcessor();

        // when
        ThumbnailImageProcessor.ProcessedThumbnail processed = processor.process(
                portrait, "image/png", ".png", 400);

        // then
        assertThat(processed.bytes()).isNotEmpty();
    }

    @Test
    void JPEG_재인코딩_결과가_원본보다_크면_원본을_그대로_사용한다() throws IOException {
        // given
        byte[] original = createPngImage(1, 1);
        ThumbnailImageProcessor processor = new ThumbnailImageProcessor();

        // when
        ThumbnailImageProcessor.ProcessedThumbnail processed = processor.process(
                original, "image/png", ".png");

        // then
        assertThat(processed.bytes()).isSameAs(original);
        assertThat(processed.contentType()).isEqualTo("image/png");
        assertThat(processed.extension()).isEqualTo(".png");
    }

    private byte[] createPngImage(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Random random = new Random(137);
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                image.setRGB(x, y, random.nextInt(0x1000000));
            }
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return output.toByteArray();
    }
}
