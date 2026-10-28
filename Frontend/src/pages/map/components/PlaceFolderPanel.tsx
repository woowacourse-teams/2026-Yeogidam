import React, { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import Svg, { Path, Rect } from 'react-native-svg';

import { FOLDER_COLORS } from '../../../lib/placeFolderStorage';
import { MAX_FOLDER_NAME_LENGTH } from '../../../lib/usePlaceFolders';

export type SheetMode = 'places' | 'folders';

export type FolderListItem = {
  id: string;
  name: string;
  color: string;
  count: number;
};

export function FolderSegmentHeader({
  mode,
  onChangeMode,
}: {
  mode: SheetMode;
  onChangeMode: (mode: SheetMode) => void;
}) {
  return (
    <View style={styles.segment}>
      {(['places', 'folders'] as const).map(item => {
        const selected = item === mode;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChangeMode(item)}
            style={[styles.segmentItem, selected && styles.segmentItemSelected]}
          >
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextSelected,
              ]}
            >
              {item === 'places' ? '장소' : '폴더'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 폴더에서 나가는 동작은 상단 검색창의 뒤로가기가 맡으므로 시트에는 두지 않습니다.
export function FolderDetailHeader({
  name,
  color,
  count,
  onMore,
}: {
  name: string;
  color: string;
  count: number;
  onMore: () => void;
}) {
  return (
    <View style={styles.detailHeader}>
      <View style={styles.detailTitleWrap}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <Text numberOfLines={1} style={styles.detailTitle}>
          {name}
        </Text>
        <Text style={styles.detailCount}>{count}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="폴더 더보기"
        hitSlop={8}
        onPress={onMore}
        style={styles.iconButton}
      >
        <MaterialIcons color="#4A4F66" name="more-horiz" size={24} />
      </Pressable>
    </View>
  );
}

// 폴더 대표 이미지입니다. 배경과 폴더 아이콘을 폴더 색으로 칠합니다.
function FolderThumbnail({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 56 56" fill="none">
      <Rect width={56} height={56} rx={14} fill={color} fillOpacity={0.3} />
      <Path
        d="M25.6663 18.666H18.6663C17.383 18.666 16.3447 19.716 16.3447 20.9993L16.333 34.9993C16.333 36.2827 17.383 37.3327 18.6663 37.3327H37.333C38.6163 37.3327 39.6663 36.2827 39.6663 34.9993V23.3327C39.6663 22.0493 38.6163 20.9993 37.333 20.9993H27.9997L25.6663 18.666Z"
        fill={color}
      />
    </Svg>
  );
}

export function FolderList({
  folders,
  bottomPadding,
  onOpenFolder,
  onLongPressFolder,
  onCreateFolder,
}: {
  folders: FolderListItem[];
  bottomPadding: number;
  onOpenFolder: (folderId: string) => void;
  onLongPressFolder: (folderId: string) => void;
  onCreateFolder: () => void;
}) {
  return (
    <ScrollView
      style={styles.listScroll}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onCreateFolder}
        style={styles.row}
      >
        <View style={[styles.thumb, styles.createThumb]}>
          <MaterialIcons color="#8FA2FF" name="create-new-folder" size={26} />
        </View>
        <Text style={styles.createText}>새 폴더 만들기</Text>
      </Pressable>
      {folders.map(folder => (
        <Pressable
          key={folder.id}
          accessibilityRole="button"
          accessibilityLabel={`${folder.name} 폴더, 장소 ${folder.count}개`}
          onPress={() => onOpenFolder(folder.id)}
          onLongPress={() => onLongPressFolder(folder.id)}
          style={styles.row}
        >
          <FolderThumbnail color={folder.color} />
          <View style={styles.rowText}>
            <View style={styles.rowNameLine}>
              <Text
                numberOfLines={1}
                style={[styles.rowName, styles.rowNameText]}
              >
                {folder.name}
              </Text>
            </View>
            <Text style={styles.rowCount}>장소 {folder.count}개</Text>
          </View>
          <MaterialIcons color="#B8BFE8" name="chevron-right" size={24} />
        </Pressable>
      ))}
      {folders.length === 0 ? (
        <Text style={styles.hint}>
          폴더를 만들어 장소를 나만의 기준으로 모아보세요.
        </Text>
      ) : null}
    </ScrollView>
  );
}

export function FolderNameDialog({
  visible,
  title,
  initialName = '',
  initialColor = FOLDER_COLORS[0],
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initialName?: string;
  initialColor?: string;
  confirmLabel: string;
  onSubmit: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setColor(initialColor);
    }
  }, [initialColor, initialName, visible]);
  const canSubmit = name.trim().length > 0;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <TextInput
            autoFocus
            maxLength={MAX_FOLDER_NAME_LENGTH}
            onChangeText={setName}
            onSubmitEditing={() => canSubmit && onSubmit(name, color)}
            placeholder="폴더 이름"
            placeholderTextColor="#A0A5BD"
            returnKeyType="done"
            style={styles.input}
            value={name}
          />
          <View style={styles.colorRow}>
            {FOLDER_COLORS.map(candidate => {
              const selected = candidate === color;
              return (
                <Pressable
                  key={candidate}
                  accessibilityRole="radio"
                  accessibilityLabel={`폴더 색상 ${candidate}`}
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  onPress={() => setColor(candidate)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: candidate },
                    selected && styles.colorSwatchSelected,
                  ]}
                >
                  {selected ? (
                    <MaterialIcons color="#ffffff" name="check" size={16} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.dialogActions}>
            <Pressable onPress={onCancel} style={styles.dialogButton}>
              <Text style={styles.dialogCancel}>취소</Text>
            </Pressable>
            <Pressable
              disabled={!canSubmit}
              onPress={() => onSubmit(name, color)}
              style={styles.dialogButton}
            >
              <Text
                style={[styles.dialogConfirm, !canSubmit && styles.disabled]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 장소 상세의 더보기에서 여는 시트입니다. 한 장소를 여러 폴더에 중복해서 담을 수 있습니다.
export function PlaceFolderAssignPicker({
  visible,
  placeName,
  folders,
  selectedFolderIds,
  onSave,
  onCancel,
}: {
  visible: boolean;
  placeName: string;
  folders: FolderListItem[];
  selectedFolderIds: string[];
  onSave: (folderIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(selectedFolderIds);
  useEffect(() => {
    if (visible) setSelected(selectedFolderIds);
  }, [selectedFolderIds, visible]);

  const toggle = (folderId: string) =>
    setSelected(current =>
      current.includes(folderId)
        ? current.filter(id => id !== folderId)
        : [...current, folderId],
    );

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <Pressable hitSlop={8} onPress={onCancel}>
            <Text style={styles.dialogCancel}>취소</Text>
          </Pressable>
          <Text style={styles.dialogTitle}>폴더 선택</Text>
          <Pressable hitSlop={8} onPress={() => onSave(selected)}>
            <Text style={styles.dialogConfirm}>저장</Text>
          </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.assignPlaceName}>
          {placeName}
        </Text>
        <FlatList
          data={folders}
          keyExtractor={folder => folder.id}
          ListEmptyComponent={
            <Text style={styles.hint}>
              지도의 폴더 탭에서 폴더를 먼저 만들어 주세요.
            </Text>
          }
          renderItem={({ item }) => {
            const checked = selected.includes(item.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => toggle(item.id)}
                style={styles.row}
              >
                <View
                  style={[styles.assignDot, { backgroundColor: item.color }]}
                />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.rowName}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowCount}>장소 {item.count}개</Text>
                </View>
                <MaterialIcons
                  color={checked ? '#8FA2FF' : '#C9CEE8'}
                  name={checked ? 'check-circle' : 'radio-button-unchecked'}
                  size={26}
                />
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// 폴더 상세의 ⋯, 폴더 목록 행 길게 누르기에서 여는 바텀 시트입니다.
export function FolderActionSheet({
  folder,
  onEdit,
  onDelete,
  onClose,
}: {
  folder: FolderListItem | null;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="none"
      transparent
      visible={folder !== null}
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.actionBackdrop}>
        <Pressable
          onPress={event => event.stopPropagation()}
          style={styles.actionSheet}
        >
          <View style={styles.actionHandle} />
          {folder ? (
            <View style={styles.actionInfo}>
              <View
                style={[styles.assignDot, { backgroundColor: folder.color }]}
              />
              <Text numberOfLines={1} style={styles.actionName}>
                {folder.name}
              </Text>
              <Text style={styles.actionCount}>장소 {folder.count}개</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이름·색상 변경"
            onPress={onEdit}
            style={styles.actionButton}
          >
            <MaterialIcons color="#000000" name="edit" size={21} />
            <Text style={styles.actionButtonText}>이름·색상 변경</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="폴더 삭제"
            onPress={onDelete}
            style={styles.actionButton}
          >
            <MaterialIcons color="#E5484D" name="delete-outline" size={21} />
            <Text style={[styles.actionButtonText, styles.actionDeleteText]}>
              폴더 삭제
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  actionSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },
  actionHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d9d9df',
  },
  actionInfo: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  actionCount: {
    fontSize: 13,
    color: '#8a8fa8',
  },
  actionButton: {
    height: 54,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9d9df',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
  },
  actionDeleteText: {
    color: '#E5484D',
  },
  assignPlaceName: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    fontSize: 14,
    color: '#8A8FA8',
  },
  assignDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 8,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#EEF0FA',
  },
  segmentItem: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemSelected: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8FA8',
  },
  segmentTextSelected: {
    color: '#1a1a2e',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    // 왼쪽 40pt는 스와이프 뒤로가기 영역이 터치를 먼저 가져가므로 비워둡니다.
    paddingLeft: 40,
    paddingRight: 12,
    marginBottom: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  detailTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  detailCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8FA2FF',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  createThumb: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B8BFE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8FA2FF',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowNameText: {
    flexShrink: 1,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  rowCount: {
    fontSize: 13,
    color: '#8A8FA8',
  },
  hint: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
    color: '#8A8FA8',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dialog: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 16,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  input: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F4F5FB',
    fontSize: 16,
    color: '#1a1a2e',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#1a1a2e33',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  dialogButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dialogCancel: {
    fontSize: 16,
    color: '#8A8FA8',
  },
  dialogConfirm: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8FA2FF',
  },
  disabled: {
    opacity: 0.4,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
});
