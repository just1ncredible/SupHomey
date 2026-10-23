
import os
import glob
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image

for dirname, _, filenames in os.walk('./'):
    for filename in filenames:
        print(os.path.join(dirname, filename))

house_df = pd.read_csv('./properties_clean_v2.csv')

house_df.head()

house_df.info()

# #### Examining City Features

house_df['city'].unique()

# Look at the 'Wind_Direction' feature
house_df['city'].value_counts()

# Replace duplicate values due to typo
house_df['city'] = house_df['city'].replace({
    'Sugar land' : 'Sugar Land',
    'Missouri city' : 'Missouri City',
    'houston' : 'Houston',
    'New caney' : 'New Caney',
    'HUMBLE' : 'Humble',
    'League city' : 'League City',
    'HOUSTON' : 'Houston',
    'Deer park' : 'Deer Park',
    'Hou' : 'Houston',
    'The Woodlands' : 'Woodland',
    'South Houston' : 'Houston',
    'East Houston' : 'Houston',
    'C Houston' : 'Houston',
})

house_df['city'].value_counts()

# Map of Houston

import seaborn as sns

plt.figure(figsize=(7,5))
sns.scatterplot(x=house_df['latitude'], y=house_df['longitude'], data=house_df, size=house_df['price'], hue=house_df['price'])
plt.title('House Price Distribution Map')
plt.show()

house_df['zipcode'].value_counts()

house_df[house_df['homeType'] == 'LOT']

house_df.drop(house_df[house_df['homeType'] == 'LOT'].index, inplace=True)

house_df[house_df['homeType'] == 'LOT']

# #### Pairplot

features = house_df.columns.to_list()
features

# Preprocessing Library
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split

# Label Encoding for the city feature
le = LabelEncoder()

house_df['homeType'] = le.fit_transform(house_df['homeType'])

house_df['city'] = le.fit_transform(house_df['city'])

house_df['yearBuilt'] = le.fit_transform(house_df['yearBuilt'])
house_df['zipcode'] = le.fit_transform(house_df['zipcode'])

n = len(features)

rows = 5
cols = 4

fig, axis = plt.subplots(rows, cols, figsize=(20, 15))
axis = axis.flatten()

for i, feature in enumerate(features):
    sns.regplot(house_df, x=feature, y='price', ax=axis[i])
    axis[i].set_xlabel(feature)
    axis[i].set_ylabel('price')
    axis[i].set_title(f'{feature} vs. price')

total = rows * cols
if (total > n):
    # disable all empty celss
    tolerance = total - n
    for i in range(tolerance):
        axis[n+i].axis('off')

plt.tight_layout()
plt.show()

plt.scatter(house_df['bedrooms'], y=house_df['price'], c=house_df['price'])
plt.xlabel('Bedrooms')
plt.ylabel('Price')
plt.title('Bedrooms vs Price')
plt.tight_layout()
plt.show()

house_df[house_df['bedrooms'] == 0]

house_df[house_df['price']>30000000]

# #### Heatmap

corr = house_df.corr(method='spearman', numeric_only=True)[['price']].drop('price')\
        .sort_values('price', ascending=False)

plt.figure(figsize=(4, 4))
sns.heatmap(corr, annot=True, fmt='.2f', annot_kws={'fontsize':10})
plt.title('Correlation Heatmap')
plt.show()

corr = house_df.corr(method='spearman', numeric_only=True)

plt.figure(figsize=(15, 10))
sns.heatmap(corr, annot=True, fmt='.2f', annot_kws={'fontsize':8})
plt.title('Correlation Heatmap')
plt.show()

# ### Apply Scaler

from sklearn.preprocessing import StandardScaler

# drop 'price' value
features.remove('price')
features.remove('zpid')
features.remove('zestimate')
features.remove('rentZestimate')
features.remove('has_zestimate')
features.remove('has_rent_zestimate')
features.remove('daysOnZillow')


target = 'price'

x = house_df[features]
y = house_df[target].values.reshape(-1, 1)

x.head()

# ### Split data and Standardize

from numpy.lib.stride_tricks import sliding_window_view
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score



import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models, callbacks

SEED = 42
keras.utils.set_random_seed(SEED)
print('TensorFlow', tf.__version__)

# print(x.shape, y.shape)


X_train, X_test, y_train, y_test = train_test_split(
    x, y, test_size=0.2, random_state=SEED
)

x_scaler = StandardScaler()
y_scaler = StandardScaler()

x_train_scaled = x_scaler.fit_transform(X_train)
x_test_scaled  = x_scaler.transform(X_test)

y_train_scaled = y_scaler.fit_transform(y_train)
y_test_scaled  = y_scaler.transform(y_test)

# LSTM input: (samples, timesteps, features_per_timestep) -> each feature is a timestep
x_train_lstm = x_train_scaled.reshape(x_train_scaled.shape[0], x_train_scaled.shape[1], 1)
x_test_lstm  = x_test_scaled.reshape(x_test_scaled.shape[0],  x_test_scaled.shape[1],  1)



print('Train:', x_train_lstm.shape, y_train_scaled.shape)
print('Test :', x_test_lstm.shape,  y_test_scaled.shape)

# ### Build the LSTM model

n_features = x_train_lstm.shape[1]

def build_lstm(n_timesteps):
    model = models.Sequential([
        layers.Input(shape=(n_timesteps, 1)),
        layers.LSTM(64, return_sequences=True),
        layers.Dropout(0.2),
        layers.LSTM(32),
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(1)                     # linear output for regression
    ])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0003),
        loss='mse',
        metrics=['mae']
    )
    return model

model = build_lstm(n_features)
model.summary()

callbacks = [
    keras.callbacks.EarlyStopping(monitor='val_loss',
                                  patience=15,
                                  restore_best_weights=True),
    
    keras.callbacks.ReduceLROnPlateau(monitor='val_loss',
                                      factor=0.5,
                                      patience=5,
                                      min_lr=0.00001),
]

history = model.fit(
    x_train_lstm, y_train_scaled,
    validation_split=0.2,
    epochs=150,
    batch_size=32,
    callbacks=callbacks,
    verbose=1
)

fig, axes = plt.subplots(1, 2, figsize=(12, 4))

axes[0].plot(history.history['loss'], label='train')
axes[0].plot(history.history['val_loss'], label='validation')
axes[0].set_title('Loss (MSE, scaled target)')
axes[0].set_xlabel('Epoch')
axes[0].legend()

axes[1].plot(history.history['mae'], label='train')
axes[1].plot(history.history['val_mae'], label='validation')
axes[1].set_title('MAE (scaled target)')
axes[1].set_xlabel('Epoch')
axes[1].legend()

plt.tight_layout()
plt.show()

# ### Evaluate the LSTM Model

y_pred_s = model.predict(x_test_lstm)
y_pred   = y_scaler.inverse_transform(y_pred_s).ravel()
y_true   = y_test.ravel()

mae  = mean_absolute_error(y_true, y_pred)
rmse = np.sqrt(mean_squared_error(y_true, y_pred))
r2   = r2_score(y_true, y_pred)
mape = np.mean(np.abs((y_true - y_pred) / y_true)) * 100

print(f'MAE : ${mae:,.0f}')
print(f'RMSE: ${rmse:,.0f}')
print(f'MAPE: {mape:.1f}%')
print(f'R^2 : {r2:.3f}')

plt.figure(figsize=(6, 6))
plt.scatter(y_true, y_pred, alpha=0.4)
lims = [min(y_true.min(), y_pred.min()), max(y_true.max(), y_pred.max())]
plt.plot(lims, lims, 'r--', label='Perfect prediction')
plt.xlabel('Actual price')
plt.ylabel('Predicted price')
plt.title('LSTM: Actual vs Predicted')
plt.legend()
plt.tight_layout()
plt.show()

results = house_df.loc[X_test.index, ['zpid', 'price', 'zestimate', 'rentZestimate']].copy()
results['predicted_price'] = np.round(y_pred.round(0), 2)
results['error'] = results['predicted_price'] - results['price']
results['error_pct'] = (results['error'] / results['price'] * 100).round(1)
results.head(15)
results.to_csv('housing_test_predictions_lstm.csv', index=False)



x_test = house_df[features]
x_test_s = x_scaler.fit_transform(x_test)
x_test_lstm  = x_test_s.reshape(x_test_s.shape[0],  x_test_s.shape[1],  1)

y_pred_s = model.predict(x_test_lstm)
y_pred   = y_scaler.inverse_transform(y_pred_s).ravel()
y_true   = y_test.ravel()

results = house_df.loc[house_df.index, ['zpid', 'price', 'zestimate', 'rentZestimate']].copy()
results['predicted_price'] = np.round(y_pred.round(0), 2)

results['error'] = results['predicted_price'] - results['price']
results['error_pct'] = (results['error'] / results['price'] * 100).round(1)
results.head(15)

results.to_csv('housing_price_predictions_lstm.csv', index=False)